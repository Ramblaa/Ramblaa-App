/**
 * Twilio Service - Ported from guestResponse.gs and twilioApiWebhook.gs
 * Handles WhatsApp messaging via Twilio API
 * 
 * KEY CHANGE: Each intent/action sends as an individual message (no consolidation)
 */

import twilio from 'twilio';
import { config } from '../config/env.js';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { v4 as uuidv4 } from 'uuid';
import { formatForWhatsApp } from '../utils/phoneUtils.js';

let twilioClient = null;

function getClient() {
  if (!twilioClient && config.twilio.accountSid && config.twilio.authToken) {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  }
  return twilioClient;
}

/**
 * Send a single WhatsApp message via Twilio
 * This is called once per intent/action (no consolidation)
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient phone number
 * @param {string} options.body - Message body
 * @param {string} options.from - Sender number (optional, uses default)
 * @param {string} options.recipientType - Guest, Staff, or Host
 * @param {Object} options.metadata - Additional metadata for logging
 * @returns {Object} - { success, messageSid, error }
 */
export async function sendWhatsAppMessage({
  to,
  body,
  from = null,
  recipientType = 'Guest',
  metadata = {},
}) {
  const fromNumber = from || config.twilio.whatsappNumber;
  const toFormatted = formatForWhatsApp(fromNumber, to);

  // Prepend role prefix for Staff/Host messages (for testing with single number)
  let messageBody = body;
  if (recipientType === 'Staff') {
    messageBody = `[STAFF] ${body}`;
  } else if (recipientType === 'Host') {
    messageBody = `[HOST] ${body}`;
  }

  // DRY RUN MODE: Log but don't actually send
  if (config.server.dryRunMode) {
    const dryRunSid = `dry-run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[DRY RUN] Would send to ${toFormatted}:`);
    console.log(`[DRY RUN] Body: ${messageBody}`);
    console.log(`[DRY RUN] Recipient: ${recipientType}`);
    
    // Still log to database for visibility
    await logOutboundMessage({
      messageSid: dryRunSid,
      from: fromNumber,
      to: toFormatted,
      body: `[DRY RUN] ${body}`,
      recipientType,
      ...metadata,
    });

    return { success: true, messageSid: dryRunSid, error: null, dryRun: true };
  }

  const client = getClient();
  
  if (!client) {
    console.error('[Twilio] Client not configured');
    return { success: false, messageSid: null, error: 'Twilio not configured' };
  }

  try {
    const message = await client.messages.create({
      body: messageBody,
      from: fromNumber,
      to: toFormatted,
    });

    console.log(`[Twilio] Sent message ${message.sid} to ${toFormatted}`);

    // Log to messages table
    await logOutboundMessage({
      messageSid: message.sid,
      from: fromNumber,
      to: toFormatted,
      body,
      recipientType,
      ...metadata,
    });

    return { success: true, messageSid: message.sid, error: null };
  } catch (error) {
    console.error('[Twilio] Send error:', error.message);
    return { success: false, messageSid: null, error: error.message };
  }
}

/**
 * Send a WhatsApp template message via Twilio ContentSid
 * Used for scheduled/automated messages with Meta-approved templates
 * 
 * @param {Object} options
 * @param {string} options.to - Recipient phone number
 * @param {string} options.from - Sender number (optional, uses default)
 * @param {string} options.contentSid - Twilio ContentSid for the template (e.g., HX1234abc...)
 * @param {Object} options.contentVariables - Variables to fill in the template
 * @param {Object} options.metadata - Additional metadata for logging
 * @returns {Object} - { success, messageSid, error }
 */
export async function sendTemplateMessage({
  to,
  from = null,
  contentSid,
  contentVariables = {},
  metadata = {},
}) {
  if (!contentSid) {
    console.error('[Twilio] No ContentSid provided');
    return { success: false, messageSid: null, error: 'No ContentSid provided' };
  }

  const fromNumber = from || config.twilio.whatsappNumber;
  const toFormatted = formatForWhatsApp(fromNumber, to);

  // DRY RUN MODE: Log but don't actually send
  if (config.server.dryRunMode) {
    const dryRunSid = `dry-run-template-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    console.log(`[DRY RUN] Would send template to ${toFormatted}:`);
    console.log(`[DRY RUN] ContentSid: ${contentSid}`);
    console.log(`[DRY RUN] Variables: ${JSON.stringify(contentVariables)}`);
    
    // Still log to database for visibility
    await logScheduledMessage({
      messageSid: dryRunSid,
      from: fromNumber,
      to: toFormatted,
      contentSid,
      contentVariables,
      ...metadata,
    });

    return { success: true, messageSid: dryRunSid, error: null, dryRun: true };
  }

  const client = getClient();
  
  if (!client) {
    console.error('[Twilio] Client not configured');
    return { success: false, messageSid: null, error: 'Twilio not configured' };
  }

  try {
    const message = await client.messages.create({
      from: fromNumber,
      to: toFormatted,
      contentSid: contentSid,
      contentVariables: JSON.stringify(contentVariables),
    });

    console.log(`[Twilio] Sent template ${contentSid} → ${message.sid} to ${toFormatted}`);

    // Log to messages table
    await logScheduledMessage({
      messageSid: message.sid,
      from: fromNumber,
      to: toFormatted,
      contentSid,
      contentVariables,
      ...metadata,
    });

    return { success: true, messageSid: message.sid, error: null };
  } catch (error) {
    console.error('[Twilio] Template send error:', error.message);
    return { success: false, messageSid: null, error: error.message };
  }
}

/**
 * Log scheduled/template message to database
 * Includes task_action='scheduled' and content_sid for querying
 */
async function logScheduledMessage({
  messageSid,
  from,
  to,
  contentSid,
  contentVariables,
  propertyId,
  bookingId,
  templateName,
  ruleId,
  scheduledMessageId,
}) {
  const db = getDb();
  const id = messageSid || uuidv4();

  try {
    // Create a body description for logging
    const bodyDescription = `[Scheduled: ${templateName || 'Template'}] Variables: ${JSON.stringify(contentVariables)}`;

    // Store ContentSid in reference_message_ids for tracking/querying
    const contentSidRef = contentSid ? `ContentSid:${contentSid}` : null;

    await db.prepare(`
      INSERT INTO messages (
        id, from_number, to_number, body, message_type, requestor_role,
        property_id, booking_id, task_action, reference_message_ids,
        content_sid, content_variables, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      from,
      to,
      bodyDescription,
      'Scheduled',           // message_type = Scheduled
      'Rambley',
      propertyId || null,
      bookingId || null,
      'scheduled',           // task_action = 'scheduled' for querying
      contentSidRef,         // reference_message_ids = "ContentSid:HX..."
      contentSid || null,    // Also store raw content_sid
      contentVariables ? JSON.stringify(contentVariables) : null
    );
    
    console.log(`[Twilio] Logged scheduled message ${id} (ContentSid: ${contentSid})`);
  } catch (error) {
    console.error('[Twilio] Failed to log scheduled message:', error.message);
  }
}

/**
 * Send multiple messages individually (one per intent)
 * NO CONSOLIDATION - each intent gets its own message
 * 
 * @param {Array} messages - Array of message objects
 * @returns {Array} - Results for each message
 */
export async function sendIndividualMessages(messages) {
  const results = [];

  for (const msg of messages) {
    const result = await sendWhatsAppMessage(msg);
    results.push({
      ...msg,
      ...result,
    });

    // Small delay between messages to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return results;
}

/**
 * Log outbound message to database
 */
async function logOutboundMessage({
  messageSid,
  from,
  to,
  body,
  recipientType,
  propertyId,
  bookingId,
  taskId,
  aiEnrichmentId,
  referenceMessageIds,
}) {
  const db = getDb();
  const id = messageSid || uuidv4();

  try {
    // If taskId is provided, this is a follow-up (task update), not initial creation
    const taskAction = taskId ? 'updated' : null;

    await db.prepare(`
      INSERT INTO messages (
        id, from_number, to_number, body, message_type, requestor_role,
        property_id, booking_id, reference_task_ids, task_action, ai_enrichment_id,
        reference_message_ids, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      from,
      to,
      body,
      'Outbound',
      recipientType,
      propertyId || null,
      bookingId || null,
      taskId || null,
      taskAction,
      aiEnrichmentId || null,
      referenceMessageIds || null
    );
    
    console.log(`[Twilio] Logged outbound message ${id} with task_action=${taskAction}`);
  } catch (error) {
    console.error('[Twilio] Failed to log outbound message:', error.message);
  }
}

/**
 * Send message log to external webhook (optional)
 * Equivalent to sendMessageLogToWebhook() from guestResponse.gs
 */
export async function sendToWebhook(messageData) {
  const { url, apiKey, accountId } = config.webhook;

  if (!url || !apiKey) {
    return null;
  }

  const payload = {
    data_type: 'message_log',
    account_id: accountId,
    message_uuid: messageData.messageSid || '',
    timestamp: new Date().toISOString(),
    from_number: messageData.from || '',
    to_number: messageData.to || '',
    message_body: messageData.body || '',
    message_type: messageData.type || 'Outbound',
    reference_message_uuids: messageData.referenceMessageIds || '',
    reference_task_uuids: messageData.taskId || '',
    booking_id: messageData.bookingId || '',
    ai_enrichment_uuid: messageData.aiEnrichmentId || '',
    requestor_role: messageData.recipientType || '',
    raw_data: {
      original_data: messageData,
      timestamp: new Date().toISOString(),
    },
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const code = response.status;
    console.log(`[Webhook] Response: ${code}`);
    return code === 200 || code === 201;
  } catch (error) {
    console.error('[Webhook] Error:', error.message);
    return null;
  }
}

/**
 * Get default "From" number based on recipient type
 */
export function getDefaultFrom(recipientType) {
  // Could have different numbers for different recipient types
  return config.twilio.whatsappNumber;
}

/**
 * Download media from Twilio (for inbound messages with attachments)
 */
export async function fetchTwilioMedia(mediaUrl) {
  const client = getClient();
  if (!client || !mediaUrl) return null;

  try {
    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(
          `${config.twilio.accountSid}:${config.twilio.authToken}`
        ).toString('base64'),
      },
    });

    if (!response.ok) {
      console.error(`[Twilio] Media fetch failed: ${response.status}`);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    return {
      bytes: Buffer.from(buffer),
      contentType,
    };
  } catch (error) {
    console.error('[Twilio] Media fetch error:', error.message);
    return null;
  }
}

export default {
  sendWhatsAppMessage,
  sendTemplateMessage,
  sendIndividualMessages,
  sendToWebhook,
  getDefaultFrom,
  fetchTwilioMedia,
};

