/**
 * Scheduled Message Processor
 * 
 * Processes pending scheduled messages from the queue.
 * Should be run via cron job every few minutes.
 */

import { getDbWithPrepare as getDb } from '../db/index.js';
import { sendTemplateMessage, sendWhatsAppMessage } from './twilio.js';
import { v4 as uuidv4 } from 'uuid';

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;

/**
 * Process all pending scheduled messages that are due
 * @returns {Object} - { processed, sent, failed }
 */
export async function processPendingScheduledMessages() {
  const db = getDb();
  const now = new Date().toISOString();
  
  console.log(`[ScheduledProcessor] Starting processing at ${now}`);
  
  try {
    // Get messages due to be sent
    const pending = await db.prepare(`
      SELECT sm.*, 
             mt.content_sid, mt.fallback_body, mt.name as template_name,
             b.guest_name, b.guest_phone,
             p.name as property_name, p.host_phone
      FROM scheduled_messages sm
      JOIN message_templates mt ON sm.template_id = mt.id
      JOIN bookings b ON sm.booking_id = b.id
      JOIN properties p ON sm.property_id = p.id
      WHERE sm.status = 'pending'
        AND sm.scheduled_for <= ?
        AND sm.retry_count < ?
      ORDER BY sm.scheduled_for ASC
      LIMIT ?
    `).all(now, MAX_RETRIES, BATCH_SIZE);

    console.log(`[ScheduledProcessor] Found ${pending.length} pending messages to process`);

    const results = {
      processed: 0,
      sent: 0,
      failed: 0,
    };

    for (const msg of pending) {
      results.processed++;
      
      try {
        const variables = msg.variables_json ? JSON.parse(msg.variables_json) : {};
        let sendResult;
        
        // Use Twilio template (ContentSid) if available, otherwise fallback to regular message
        if (msg.content_sid) {
          sendResult = await sendTemplateMessage({
            to: msg.to_number,
            contentSid: msg.content_sid,
            contentVariables: variables,
            metadata: {
              propertyId: msg.property_id,
              bookingId: msg.booking_id,
              scheduleType: 'scheduled',
              templateName: msg.template_name,
            },
          });
        } else if (msg.fallback_body) {
          // Use fallback body with variable substitution
          const messageBody = substituteVariables(msg.fallback_body, variables);
          
          sendResult = await sendWhatsAppMessage({
            to: msg.to_number,
            body: messageBody,
            recipientType: 'Guest',
            metadata: {
              propertyId: msg.property_id,
              bookingId: msg.booking_id,
              scheduleType: 'scheduled',
              templateName: msg.template_name,
            },
          });
        } else {
          throw new Error('No content_sid or fallback_body configured for template');
        }

        if (sendResult.success) {
          // Mark as sent
          await db.prepare(`
            UPDATE scheduled_messages
            SET status = 'sent', 
                sent_at = CURRENT_TIMESTAMP, 
                message_sid = ?,
                error_message = NULL
            WHERE id = ?
          `).run(sendResult.messageSid, msg.id);

          console.log(`[ScheduledProcessor] ✓ Sent "${msg.template_name}" to ${msg.to_number} (${sendResult.messageSid})`);
          results.sent++;
        } else {
          throw new Error(sendResult.error || 'Send failed');
        }
      } catch (error) {
        console.error(`[ScheduledProcessor] ✗ Failed to send ${msg.id}:`, error.message);
        
        const newRetryCount = (msg.retry_count || 0) + 1;
        const newStatus = newRetryCount >= MAX_RETRIES ? 'failed' : 'pending';
        
        await db.prepare(`
          UPDATE scheduled_messages
          SET retry_count = ?, 
              status = ?,
              error_message = ?
          WHERE id = ?
        `).run(newRetryCount, newStatus, error.message, msg.id);

        if (newStatus === 'failed') {
          results.failed++;
        }
      }

      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    console.log(`[ScheduledProcessor] Complete: ${results.sent} sent, ${results.failed} failed out of ${results.processed}`);
    return results;
  } catch (error) {
    console.error('[ScheduledProcessor] Error:', error.message);
    throw error;
  }
}

/**
 * Substitute template variables in a message body
 * Supports both {{variable}} and numbered {1} formats
 */
function substituteVariables(template, variables) {
  let result = template;
  
  for (const [key, value] of Object.entries(variables)) {
    // Replace {{key}} format
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'gi'), value);
    // Replace {key} format (Twilio numbered)
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
  }
  
  return result;
}

/**
 * Get scheduled message statistics
 */
export async function getScheduledMessageStats() {
  const db = getDb();
  
  const stats = await db.prepare(`
    SELECT 
      status,
      COUNT(*) as count
    FROM scheduled_messages
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY status
  `).all();
  
  const upcoming = await db.prepare(`
    SELECT COUNT(*) as count
    FROM scheduled_messages
    WHERE status = 'pending'
      AND scheduled_for > NOW()
      AND scheduled_for < NOW() + INTERVAL '24 hours'
  `).get();
  
  return {
    byStatus: stats.reduce((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {}),
    upcomingNext24Hours: upcoming?.count || 0,
  };
}

/**
 * Retry failed messages (manual trigger)
 */
export async function retryFailedMessages() {
  const db = getDb();
  
  const result = await db.prepare(`
    UPDATE scheduled_messages
    SET status = 'pending',
        retry_count = 0,
        error_message = 'Manual retry triggered'
    WHERE status = 'failed'
      AND created_at > NOW() - INTERVAL '7 days'
  `).run();

  console.log(`[ScheduledProcessor] Reset ${result.changes || 0} failed messages for retry`);
  return { reset: result.changes || 0 };
}

/**
 * Clean up old scheduled messages (archival)
 */
export async function cleanupOldMessages(daysToKeep = 90) {
  const db = getDb();
  
  const result = await db.prepare(`
    DELETE FROM scheduled_messages
    WHERE created_at < NOW() - INTERVAL '? days'
      AND status IN ('sent', 'cancelled', 'failed')
  `).run(daysToKeep);

  console.log(`[ScheduledProcessor] Cleaned up ${result.changes || 0} old messages`);
  return { deleted: result.changes || 0 };
}

export default {
  processPendingScheduledMessages,
  getScheduledMessageStats,
  retryFailedMessages,
  cleanupOldMessages,
};

