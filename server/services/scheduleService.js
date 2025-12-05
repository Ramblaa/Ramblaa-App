/**
 * Schedule Service - Evaluates booking events and queues scheduled messages
 * 
 * Trigger Types:
 * - ON_BOOKING_CREATED: Send immediately when booking is created
 * - DAYS_BEFORE_CHECKIN: X days before check-in date
 * - ON_CHECKIN_DATE: On the check-in date
 * - DAYS_AFTER_CHECKIN: X days after check-in
 * - ON_CHECKOUT_DATE: On the check-out date
 * - DAYS_AFTER_CHECKOUT: X days after check-out
 */

import { getDbWithPrepare as getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';

export const TRIGGER_TYPES = {
  ON_BOOKING_CREATED: 'ON_BOOKING_CREATED',
  DAYS_BEFORE_CHECKIN: 'DAYS_BEFORE_CHECKIN',
  ON_CHECKIN_DATE: 'ON_CHECKIN_DATE',
  DAYS_AFTER_CHECKIN: 'DAYS_AFTER_CHECKIN',
  ON_CHECKOUT_DATE: 'ON_CHECKOUT_DATE',
  DAYS_AFTER_CHECKOUT: 'DAYS_AFTER_CHECKOUT',
};

/**
 * Called when a new booking is created - evaluates all rules and queues messages
 * @param {Object} booking - The booking object with property_id, guest details, dates
 */
export async function onBookingCreated(booking) {
  const db = getDb();
  
  console.log(`[ScheduleService] Evaluating rules for new booking ${booking.id}`);
  
  try {
    // Get all active rules for this property (include created_at for backfill prevention)
    const rules = await db.prepare(`
      SELECT r.*, r.created_at as rule_created_at, 
             t.content_sid, t.variables_schema, t.name as template_name
      FROM message_schedule_rules r
      JOIN message_templates t ON r.template_id = t.id
      WHERE r.property_id = ? AND r.is_active = 1 AND t.is_active = 1
      ORDER BY r.priority ASC
    `).all(booking.property_id);

    console.log(`[ScheduleService] Found ${rules.length} active rules for property ${booking.property_id}`);

    let queuedCount = 0;
    
    for (const rule of rules) {
      try {
        const scheduledFor = calculateScheduledTime(rule, booking);
        
        if (!scheduledFor) {
          console.log(`[ScheduleService] Rule ${rule.name}: skipped (schedule time in past or invalid)`);
          continue;
        }
        
        // Check conditions
        if (!meetsConditions(rule, booking)) {
          console.log(`[ScheduleService] Rule ${rule.name}: skipped (conditions not met)`);
          continue;
        }

        // Build variables
        const variables = buildVariables(rule.variables_schema, booking);

        // Queue the message using UPSERT to prevent duplicates
        const messageId = uuidv4();
        
        await db.prepare(`
          INSERT INTO scheduled_messages (
            id, booking_id, property_id, template_id, rule_id,
            to_number, guest_name, scheduled_for, variables_json, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
          ON CONFLICT (booking_id, rule_id) DO UPDATE SET
            scheduled_for = EXCLUDED.scheduled_for,
            variables_json = EXCLUDED.variables_json,
            status = CASE 
              WHEN scheduled_messages.status = 'sent' THEN 'sent' 
              WHEN scheduled_messages.status = 'cancelled' THEN 'cancelled'
              ELSE 'pending' 
            END,
            error_message = NULL,
            retry_count = 0
        `).run(
          messageId,
          booking.id,
          booking.property_id,
          rule.template_id,
          rule.id,
          booking.guest_phone,
          booking.guest_name,
          scheduledFor.toISOString(),
          JSON.stringify(variables)
        );

        console.log(`[ScheduleService] ✓ Queued "${rule.name}" for ${scheduledFor.toISOString()}`);
        queuedCount++;
      } catch (ruleError) {
        console.error(`[ScheduleService] Error processing rule ${rule.id}:`, ruleError.message);
      }
    }

    console.log(`[ScheduleService] Queued ${queuedCount} messages for booking ${booking.id}`);
    return { queued: queuedCount };
  } catch (error) {
    console.error('[ScheduleService] Error in onBookingCreated:', error.message);
    throw error;
  }
}

/**
 * Called when booking dates are updated - recalculates scheduled times
 * @param {Object} booking - Updated booking object
 */
export async function onBookingUpdated(booking) {
  const db = getDb();
  
  console.log(`[ScheduleService] Recalculating schedules for updated booking ${booking.id}`);
  
  try {
    // Get pending scheduled messages for this booking
    const pendingMessages = await db.prepare(`
      SELECT sm.*, r.trigger_type, r.trigger_offset_days, r.trigger_time, r.name as rule_name
      FROM scheduled_messages sm
      JOIN message_schedule_rules r ON sm.rule_id = r.id
      WHERE sm.booking_id = ? AND sm.status = 'pending'
    `).all(booking.id);

    let updatedCount = 0;
    
    for (const msg of pendingMessages) {
      const rule = {
        trigger_type: msg.trigger_type,
        trigger_offset_days: msg.trigger_offset_days,
        trigger_time: msg.trigger_time,
      };
      
      const newScheduledFor = calculateScheduledTime(rule, booking);
      
      if (newScheduledFor) {
        await db.prepare(`
          UPDATE scheduled_messages
          SET scheduled_for = ?, variables_json = ?
          WHERE id = ?
        `).run(
          newScheduledFor.toISOString(),
          JSON.stringify(buildVariables(null, booking)),
          msg.id
        );
        
        console.log(`[ScheduleService] Updated "${msg.rule_name}" to ${newScheduledFor.toISOString()}`);
        updatedCount++;
      } else {
        // Schedule time is now in the past, cancel it
        await db.prepare(`
          UPDATE scheduled_messages
          SET status = 'cancelled', error_message = 'Schedule time passed after booking update'
          WHERE id = ?
        `).run(msg.id);
        
        console.log(`[ScheduleService] Cancelled "${msg.rule_name}" (now in past)`);
      }
    }

    return { updated: updatedCount };
  } catch (error) {
    console.error('[ScheduleService] Error in onBookingUpdated:', error.message);
    throw error;
  }
}

/**
 * Called when a booking is cancelled - cancels all pending scheduled messages
 * @param {string} bookingId - The booking ID
 */
export async function onBookingCancelled(bookingId) {
  const db = getDb();
  
  console.log(`[ScheduleService] Cancelling all scheduled messages for booking ${bookingId}`);
  
  try {
    const result = await db.prepare(`
      UPDATE scheduled_messages
      SET status = 'cancelled', error_message = 'Booking cancelled'
      WHERE booking_id = ? AND status = 'pending'
    `).run(bookingId);

    console.log(`[ScheduleService] Cancelled ${result.changes || 0} scheduled messages`);
    return { cancelled: result.changes || 0 };
  } catch (error) {
    console.error('[ScheduleService] Error in onBookingCancelled:', error.message);
    throw error;
  }
}

/**
 * Daily job to evaluate date-based rules for all active bookings
 * This catches any bookings that might have been created before rules existed
 */
export async function evaluateDateBasedRules() {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  
  console.log(`[ScheduleService] Running daily evaluation for ${today}`);
  
  try {
    // Get active bookings with upcoming dates (next 7 days window)
    const futureDate = new Date(now);
    futureDate.setDate(futureDate.getDate() + 7);
    
    const bookings = await db.prepare(`
      SELECT b.*, p.name as property_name
      FROM bookings b
      JOIN properties p ON b.property_id = p.id
      WHERE (b.start_date >= ? AND b.start_date <= ?)
         OR (b.end_date >= ? AND b.end_date <= ?)
    `).all(today, futureDate.toISOString().split('T')[0], today, futureDate.toISOString().split('T')[0]);

    console.log(`[ScheduleService] Found ${bookings.length} bookings in date range`);

    let totalQueued = 0;
    
    for (const booking of bookings) {
      const result = await onBookingCreated(booking);
      totalQueued += result.queued;
    }

    console.log(`[ScheduleService] Daily evaluation complete: ${totalQueued} messages queued`);
    return { bookingsChecked: bookings.length, messagesQueued: totalQueued };
  } catch (error) {
    console.error('[ScheduleService] Error in evaluateDateBasedRules:', error.message);
    throw error;
  }
}

/**
 * Calculate when to send based on trigger type and booking dates
 * @param {Object} rule - The schedule rule
 * @param {Object} booking - The booking object
 * @returns {Date|null} - The scheduled send time, or null if invalid/past
 */
function calculateScheduledTime(rule, booking) {
  const now = new Date();
  const checkIn = new Date(booking.start_date);
  const checkOut = new Date(booking.end_date);
  
  let baseDate;
  
  switch (rule.trigger_type) {
    case TRIGGER_TYPES.ON_BOOKING_CREATED:
      // Send immediately (within next minute)
      const immediate = new Date(now);
      immediate.setSeconds(immediate.getSeconds() + 30);
      return immediate;
      
    case TRIGGER_TYPES.DAYS_BEFORE_CHECKIN:
      baseDate = new Date(checkIn);
      baseDate.setDate(baseDate.getDate() - Math.abs(rule.trigger_offset_days || 0));
      break;
      
    case TRIGGER_TYPES.ON_CHECKIN_DATE:
      baseDate = new Date(checkIn);
      break;
      
    case TRIGGER_TYPES.DAYS_AFTER_CHECKIN:
      baseDate = new Date(checkIn);
      baseDate.setDate(baseDate.getDate() + (rule.trigger_offset_days || 0));
      break;
      
    case TRIGGER_TYPES.ON_CHECKOUT_DATE:
      baseDate = new Date(checkOut);
      break;
      
    case TRIGGER_TYPES.DAYS_AFTER_CHECKOUT:
      baseDate = new Date(checkOut);
      baseDate.setDate(baseDate.getDate() + (rule.trigger_offset_days || 0));
      break;
      
    default:
      console.warn(`[ScheduleService] Unknown trigger type: ${rule.trigger_type}`);
      return null;
  }
  
  // Apply trigger_time (e.g., send at 9:00 AM) for date-based triggers
  if (rule.trigger_time && rule.trigger_type !== TRIGGER_TYPES.ON_BOOKING_CREATED) {
    const timeParts = String(rule.trigger_time).split(':');
    const hours = parseInt(timeParts[0], 10) || 9;
    const minutes = parseInt(timeParts[1], 10) || 0;
    baseDate.setHours(hours, minutes, 0, 0);
  }
  
  // Don't schedule in the past (except for immediate triggers which are handled above)
  if (baseDate <= now && rule.trigger_type !== TRIGGER_TYPES.ON_BOOKING_CREATED) {
    return null;
  }
  
  return baseDate;
}

/**
 * Check if a booking meets the rule's conditions
 * @param {Object} rule - The schedule rule with conditions
 * @param {Object} booking - The booking object
 * @returns {boolean} - True if conditions are met
 */
function meetsConditions(rule, booking) {
  // BACKFILL LOGIC:
  // - ON_BOOKING_CREATED: Only for bookings created AFTER rule was created (no spam to old bookings)
  // - Date-based triggers: Apply to ANY active booking if the schedule date hasn't passed yet
  //   (e.g., a booking from 3 months ago can still get "2 days before check-in" if that date is upcoming)
  
  if (rule.trigger_type === TRIGGER_TYPES.ON_BOOKING_CREATED) {
    // For "on booking created" - only apply to new bookings after rule was created
    if (rule.created_at && booking.created_at) {
      const ruleCreated = new Date(rule.created_at);
      const bookingCreated = new Date(booking.created_at);
      
      if (bookingCreated < ruleCreated) {
        console.log(`[ScheduleService] Rule "${rule.name}": skipped ON_BOOKING_CREATED (booking predates rule)`);
        return false;
      }
    }
  }
  // For date-based triggers (DAYS_BEFORE_CHECKIN, etc.), we allow old bookings
  // as long as the scheduled date is still in the future (handled in calculateScheduledTime)
  
  // Check minimum stay nights
  if (rule.min_stay_nights) {
    const nights = calculateNights(booking.start_date, booking.end_date);
    if (nights < rule.min_stay_nights) {
      return false;
    }
  }
  
  // Check platform filter
  if (rule.platform_filter) {
    try {
      const platforms = JSON.parse(rule.platform_filter);
      if (Array.isArray(platforms) && platforms.length > 0) {
        const bookingPlatform = booking.platform || 
          (booking.details_json ? JSON.parse(booking.details_json).platform : null);
        
        if (bookingPlatform && !platforms.includes(bookingPlatform)) {
          return false;
        }
      }
    } catch (e) {
      // Invalid JSON, ignore filter
    }
  }
  
  return true;
}

/**
 * Build template variables from booking data
 * @param {string} schema - JSON string of variable keys needed
 * @param {Object} booking - The booking object
 * @returns {Object} - Variables object for template
 */
function buildVariables(schema, booking) {
  const variables = {};
  
  let schemaKeys = [];
  if (schema) {
    try {
      schemaKeys = JSON.parse(schema);
    } catch (e) {
      schemaKeys = [];
    }
  }
  
  // If no schema, include all common variables
  if (schemaKeys.length === 0) {
    schemaKeys = ['1', '2', '3', '4', '5']; // Twilio uses numbered vars
  }
  
  // Build a map of available values
  const bookingDetails = booking.details_json ? 
    (typeof booking.details_json === 'string' ? JSON.parse(booking.details_json) : booking.details_json) : {};
  
  const valueMap = {
    // Common name-based variables
    guest_name: booking.guest_name || 'Guest',
    name: booking.guest_name || 'Guest',
    check_in_date: formatDate(booking.start_date),
    checkin_date: formatDate(booking.start_date),
    check_out_date: formatDate(booking.end_date),
    checkout_date: formatDate(booking.end_date),
    property_name: booking.property_name || bookingDetails.property_name || 'your property',
    nights: String(calculateNights(booking.start_date, booking.end_date)),
    confirmation_code: bookingDetails.confirmationCode || booking.id?.slice(0, 8) || '',
    
    // Twilio numbered variables (1-5)
    '1': booking.guest_name || 'Guest',
    '2': formatDate(booking.start_date),
    '3': formatDate(booking.end_date),
    '4': booking.property_name || bookingDetails.property_name || 'your property',
    '5': String(calculateNights(booking.start_date, booking.end_date)),
  };
  
  // Map schema keys to values
  for (const key of schemaKeys) {
    variables[key] = valueMap[key] || valueMap[key.toLowerCase()] || '';
  }
  
  return variables;
}

/**
 * Calculate number of nights between two dates
 */
function calculateNights(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Format a date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Get all scheduled messages for a booking (for UI display)
 */
export async function getScheduledMessagesForBooking(bookingId) {
  const db = getDb();
  
  const messages = await db.prepare(`
    SELECT sm.*, 
           r.name as rule_name, r.trigger_type,
           t.name as template_name
    FROM scheduled_messages sm
    JOIN message_schedule_rules r ON sm.rule_id = r.id
    JOIN message_templates t ON sm.template_id = t.id
    WHERE sm.booking_id = ?
    ORDER BY sm.scheduled_for ASC
  `).all(bookingId);
  
  return messages;
}

/**
 * Cancel a specific scheduled message
 */
export async function cancelScheduledMessage(messageId) {
  const db = getDb();
  
  const result = await db.prepare(`
    UPDATE scheduled_messages
    SET status = 'cancelled', error_message = 'Manually cancelled'
    WHERE id = ? AND status = 'pending'
  `).run(messageId);
  
  return { cancelled: result.changes > 0 };
}

export default {
  TRIGGER_TYPES,
  onBookingCreated,
  onBookingUpdated,
  onBookingCancelled,
  evaluateDateBasedRules,
  getScheduledMessagesForBooking,
  cancelScheduledMessage,
};

