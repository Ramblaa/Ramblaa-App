/**
 * Scheduled Messages Routes
 * API endpoints for managing message templates, schedule rules, and scheduled messages
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { TRIGGER_TYPES, onBookingCreated, getScheduledMessagesForBooking, cancelScheduledMessage } from '../services/scheduleService.js';
import { processPendingScheduledMessages, getScheduledMessageStats, retryFailedMessages } from '../services/scheduledMessageProcessor.js';

const router = Router();

// ============================================================
// MESSAGE TEMPLATES
// ============================================================

/**
 * GET /api/scheduled/templates
 * Get all message templates, optionally filtered by property
 */
router.get('/templates', async (req, res) => {
  try {
    const db = getDb();
    const { propertyId } = req.query;

    let query = `
      SELECT mt.*, p.name as property_name,
             (SELECT COUNT(*) FROM message_schedule_rules msr WHERE msr.template_id = mt.id) as rule_count
      FROM message_templates mt
      JOIN properties p ON mt.property_id = p.id
    `;
    const params = [];

    if (propertyId) {
      query += ` WHERE mt.property_id = ?`;
      params.push(propertyId);
    }

    query += ` ORDER BY mt.created_at DESC`;

    const templates = await db.prepare(query).all(...params);

    res.json(templates.map(t => ({
      id: t.id,
      propertyId: t.property_id,
      propertyName: t.property_name,
      name: t.name,
      contentSid: t.content_sid,
      variablesSchema: t.variables_schema ? JSON.parse(t.variables_schema) : [],
      isActive: t.is_active === 1,
      ruleCount: t.rule_count,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    })));
  } catch (error) {
    console.error('[Scheduled] Templates list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/scheduled/templates/:id
 * Get a single template
 */
router.get('/templates/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    const template = await db.prepare(`
      SELECT mt.*, p.name as property_name
      FROM message_templates mt
      JOIN properties p ON mt.property_id = p.id
      WHERE mt.id = ?
    `).get(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    // Get rules using this template
    const rules = await db.prepare(`
      SELECT * FROM message_schedule_rules WHERE template_id = ?
    `).all(id);

    res.json({
      id: template.id,
      propertyId: template.property_id,
      propertyName: template.property_name,
      name: template.name,
      contentSid: template.content_sid,
      variablesSchema: template.variables_schema ? JSON.parse(template.variables_schema) : [],
      isActive: template.is_active === 1,
      createdAt: template.created_at,
      updatedAt: template.updated_at,
      rules: rules.map(r => ({
        id: r.id,
        name: r.name,
        triggerType: r.trigger_type,
        triggerOffsetDays: r.trigger_offset_days,
        triggerTime: r.trigger_time,
        isActive: r.is_active === 1,
      })),
    });
  } catch (error) {
    console.error('[Scheduled] Template get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scheduled/templates
 * Create a new message template
 */
router.post('/templates', async (req, res) => {
  try {
    const db = getDb();
    const { propertyId, name, contentSid, variablesSchema } = req.body;

    if (!propertyId || !name) {
      return res.status(400).json({ error: 'Missing required fields: propertyId, name' });
    }

    if (!contentSid) {
      return res.status(400).json({ error: 'contentSid is required (Twilio template ID)' });
    }

    const id = uuidv4();

    await db.prepare(`
      INSERT INTO message_templates (
        id, property_id, name, content_sid, variables_schema,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      propertyId,
      name,
      contentSid,
      variablesSchema ? JSON.stringify(variablesSchema) : null
    );

    const template = await db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
    res.status(201).json({
      id: template.id,
      propertyId: template.property_id,
      name: template.name,
      contentSid: template.content_sid,
      variablesSchema: template.variables_schema ? JSON.parse(template.variables_schema) : [],
      isActive: template.is_active === 1,
    });
  } catch (error) {
    console.error('[Scheduled] Template create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/scheduled/templates/:id
 * Update a message template
 */
router.put('/templates/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { name, contentSid, variablesSchema, isActive } = req.body;

    const existing = await db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Template not found' });
    }

    await db.prepare(`
      UPDATE message_templates SET
        name = COALESCE(?, name),
        content_sid = COALESCE(?, content_sid),
        variables_schema = ?,
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || null,
      contentSid || null,
      variablesSchema ? JSON.stringify(variablesSchema) : existing.variables_schema,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      id
    );

    const updated = await db.prepare('SELECT * FROM message_templates WHERE id = ?').get(id);
    res.json({
      id: updated.id,
      propertyId: updated.property_id,
      name: updated.name,
      contentSid: updated.content_sid,
      variablesSchema: updated.variables_schema ? JSON.parse(updated.variables_schema) : [],
      isActive: updated.is_active === 1,
    });
  } catch (error) {
    console.error('[Scheduled] Template update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/scheduled/templates/:id
 * Delete a message template (only if no rules reference it)
 */
router.delete('/templates/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    // Check for referencing rules
    const ruleCount = await db.prepare(
      'SELECT COUNT(*) as count FROM message_schedule_rules WHERE template_id = ?'
    ).get(id);

    if (ruleCount?.count > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete template with existing schedule rules. Delete the rules first.' 
      });
    }

    await db.prepare('DELETE FROM message_templates WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Scheduled] Template delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SCHEDULE RULES
// ============================================================

/**
 * GET /api/scheduled/rules
 * Get all schedule rules
 */
router.get('/rules', async (req, res) => {
  try {
    const db = getDb();
    const { propertyId, templateId } = req.query;

    let query = `
      SELECT r.*, t.name as template_name, p.name as property_name
      FROM message_schedule_rules r
      JOIN message_templates t ON r.template_id = t.id
      JOIN properties p ON r.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (propertyId) {
      query += ` AND r.property_id = ?`;
      params.push(propertyId);
    }

    if (templateId) {
      query += ` AND r.template_id = ?`;
      params.push(templateId);
    }

    query += ` ORDER BY r.priority ASC, r.created_at DESC`;

    const rules = await db.prepare(query).all(...params);

    res.json(rules.map(r => ({
      id: r.id,
      propertyId: r.property_id,
      propertyName: r.property_name,
      templateId: r.template_id,
      templateName: r.template_name,
      name: r.name,
      triggerType: r.trigger_type,
      triggerOffsetDays: r.trigger_offset_days,
      triggerTime: r.trigger_time,
      minStayNights: r.min_stay_nights,
      platformFilter: r.platform_filter ? JSON.parse(r.platform_filter) : null,
      priority: r.priority,
      isActive: r.is_active === 1,
      createdAt: r.created_at,
    })));
  } catch (error) {
    console.error('[Scheduled] Rules list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scheduled/rules
 * Create a new schedule rule
 */
router.post('/rules', async (req, res) => {
  try {
    const db = getDb();
    const {
      propertyId,
      templateId,
      name,
      triggerType,
      triggerOffsetDays = 0,
      triggerTime = '09:00:00',
      minStayNights,
      platformFilter,
      priority = 100,
    } = req.body;

    if (!propertyId || !templateId || !name || !triggerType) {
      return res.status(400).json({ 
        error: 'Missing required fields: propertyId, templateId, name, triggerType' 
      });
    }

    // Validate trigger type
    if (!Object.values(TRIGGER_TYPES).includes(triggerType)) {
      return res.status(400).json({ 
        error: `Invalid triggerType. Must be one of: ${Object.values(TRIGGER_TYPES).join(', ')}` 
      });
    }

    const id = uuidv4();

    await db.prepare(`
      INSERT INTO message_schedule_rules (
        id, property_id, template_id, name, trigger_type, trigger_offset_days,
        trigger_time, min_stay_nights, platform_filter, priority, is_active,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run(
      id,
      propertyId,
      templateId,
      name,
      triggerType,
      triggerOffsetDays,
      triggerTime,
      minStayNights || null,
      platformFilter ? JSON.stringify(platformFilter) : null,
      priority
    );

    const rule = await db.prepare(`
      SELECT r.*, t.name as template_name
      FROM message_schedule_rules r
      JOIN message_templates t ON r.template_id = t.id
      WHERE r.id = ?
    `).get(id);

    res.status(201).json({
      id: rule.id,
      propertyId: rule.property_id,
      templateId: rule.template_id,
      templateName: rule.template_name,
      name: rule.name,
      triggerType: rule.trigger_type,
      triggerOffsetDays: rule.trigger_offset_days,
      triggerTime: rule.trigger_time,
      minStayNights: rule.min_stay_nights,
      platformFilter: rule.platform_filter ? JSON.parse(rule.platform_filter) : null,
      priority: rule.priority,
      isActive: rule.is_active === 1,
    });
  } catch (error) {
    console.error('[Scheduled] Rule create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/scheduled/rules/:id
 * Update a schedule rule
 */
router.put('/rules/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const {
      name,
      triggerType,
      triggerOffsetDays,
      triggerTime,
      minStayNights,
      platformFilter,
      priority,
      isActive,
    } = req.body;

    const existing = await db.prepare('SELECT * FROM message_schedule_rules WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' });
    }

    if (triggerType && !Object.values(TRIGGER_TYPES).includes(triggerType)) {
      return res.status(400).json({ 
        error: `Invalid triggerType. Must be one of: ${Object.values(TRIGGER_TYPES).join(', ')}` 
      });
    }

    await db.prepare(`
      UPDATE message_schedule_rules SET
        name = COALESCE(?, name),
        trigger_type = COALESCE(?, trigger_type),
        trigger_offset_days = COALESCE(?, trigger_offset_days),
        trigger_time = COALESCE(?, trigger_time),
        min_stay_nights = ?,
        platform_filter = ?,
        priority = COALESCE(?, priority),
        is_active = COALESCE(?, is_active),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || null,
      triggerType || null,
      triggerOffsetDays !== undefined ? triggerOffsetDays : null,
      triggerTime || null,
      minStayNights !== undefined ? minStayNights : existing.min_stay_nights,
      platformFilter !== undefined ? JSON.stringify(platformFilter) : existing.platform_filter,
      priority !== undefined ? priority : null,
      isActive !== undefined ? (isActive ? 1 : 0) : null,
      id
    );

    const updated = await db.prepare(`
      SELECT r.*, t.name as template_name
      FROM message_schedule_rules r
      JOIN message_templates t ON r.template_id = t.id
      WHERE r.id = ?
    `).get(id);

    res.json({
      id: updated.id,
      propertyId: updated.property_id,
      templateId: updated.template_id,
      templateName: updated.template_name,
      name: updated.name,
      triggerType: updated.trigger_type,
      triggerOffsetDays: updated.trigger_offset_days,
      triggerTime: updated.trigger_time,
      isActive: updated.is_active === 1,
    });
  } catch (error) {
    console.error('[Scheduled] Rule update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/scheduled/rules/:id
 * Delete a schedule rule
 */
router.delete('/rules/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;

    await db.prepare('DELETE FROM message_schedule_rules WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Scheduled] Rule delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// SCHEDULED MESSAGES
// ============================================================

/**
 * GET /api/scheduled/messages
 * Get scheduled messages, optionally filtered
 */
router.get('/messages', async (req, res) => {
  try {
    const db = getDb();
    const { bookingId, status, limit = 100 } = req.query;

    let query = `
      SELECT sm.*, 
             r.name as rule_name, r.trigger_type,
             t.name as template_name,
             b.guest_name, b.start_date, b.end_date,
             p.name as property_name
      FROM scheduled_messages sm
      JOIN message_schedule_rules r ON sm.rule_id = r.id
      JOIN message_templates t ON sm.template_id = t.id
      JOIN bookings b ON sm.booking_id = b.id
      JOIN properties p ON sm.property_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (bookingId) {
      query += ` AND sm.booking_id = ?`;
      params.push(bookingId);
    }

    if (status) {
      query += ` AND sm.status = ?`;
      params.push(status);
    }

    query += ` ORDER BY sm.scheduled_for DESC LIMIT ?`;
    params.push(parseInt(limit, 10));

    const messages = await db.prepare(query).all(...params);

    res.json(messages.map(m => ({
      id: m.id,
      bookingId: m.booking_id,
      propertyId: m.property_id,
      propertyName: m.property_name,
      guestName: m.guest_name,
      toNumber: m.to_number,
      ruleName: m.rule_name,
      templateName: m.template_name,
      triggerType: m.trigger_type,
      scheduledFor: m.scheduled_for,
      status: m.status,
      sentAt: m.sent_at,
      messageSid: m.message_sid,
      errorMessage: m.error_message,
      retryCount: m.retry_count,
      createdAt: m.created_at,
    })));
  } catch (error) {
    console.error('[Scheduled] Messages list error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scheduled/messages/:id/cancel
 * Cancel a pending scheduled message
 */
router.post('/messages/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await cancelScheduledMessage(id);
    
    if (result.cancelled) {
      res.json({ success: true, message: 'Message cancelled' });
    } else {
      res.status(400).json({ error: 'Message could not be cancelled (may already be sent or cancelled)' });
    }
  } catch (error) {
    console.error('[Scheduled] Message cancel error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/scheduled/booking/:bookingId
 * Get all scheduled messages for a specific booking
 */
router.get('/booking/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    const messages = await getScheduledMessagesForBooking(bookingId);
    
    res.json(messages.map(m => ({
      id: m.id,
      ruleName: m.rule_name,
      templateName: m.template_name,
      triggerType: m.trigger_type,
      scheduledFor: m.scheduled_for,
      status: m.status,
      sentAt: m.sent_at,
      errorMessage: m.error_message,
    })));
  } catch (error) {
    console.error('[Scheduled] Booking messages error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// UTILITY ENDPOINTS
// ============================================================

/**
 * GET /api/scheduled/trigger-types
 * Get available trigger types
 */
router.get('/trigger-types', (req, res) => {
  res.json(Object.entries(TRIGGER_TYPES).map(([key, value]) => ({
    key,
    value,
    description: getTriggerDescription(value),
  })));
});

function getTriggerDescription(triggerType) {
  const descriptions = {
    ON_BOOKING_CREATED: 'Send immediately when booking is created',
    DAYS_BEFORE_CHECKIN: 'Send X days before check-in date',
    ON_CHECKIN_DATE: 'Send on the check-in date',
    DAYS_AFTER_CHECKIN: 'Send X days after check-in',
    ON_CHECKOUT_DATE: 'Send on the check-out date',
    DAYS_AFTER_CHECKOUT: 'Send X days after check-out',
  };
  return descriptions[triggerType] || triggerType;
}

/**
 * GET /api/scheduled/stats
 * Get scheduled message statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await getScheduledMessageStats();
    res.json(stats);
  } catch (error) {
    console.error('[Scheduled] Stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scheduled/process
 * Manually trigger processing of pending messages (for testing)
 */
router.post('/process', async (req, res) => {
  try {
    const result = await processPendingScheduledMessages();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Scheduled] Process error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scheduled/retry-failed
 * Retry all failed messages
 */
router.post('/retry-failed', async (req, res) => {
  try {
    const result = await retryFailedMessages();
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('[Scheduled] Retry failed error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/scheduled/test-booking/:bookingId
 * Test: Evaluate rules for a specific booking (re-queue messages)
 */
router.post('/test-booking/:bookingId', async (req, res) => {
  try {
    const db = getDb();
    const { bookingId } = req.params;

    const booking = await db.prepare(`
      SELECT b.*, p.name as property_name
      FROM bookings b
      JOIN properties p ON b.property_id = p.id
      WHERE b.id = ?
    `).get(bookingId);

    if (!booking) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const result = await onBookingCreated(booking);
    res.json({
      success: true,
      booking: {
        id: booking.id,
        guestName: booking.guest_name,
        startDate: booking.start_date,
        endDate: booking.end_date,
      },
      ...result,
    });
  } catch (error) {
    console.error('[Scheduled] Test booking error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

