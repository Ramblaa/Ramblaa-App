/**
 * Message Processor Service - Ported from guestResponse.gs
 * Core AI pipeline for processing inbound messages
 * 
 * KEY CHANGE: No consolidation - each intent processed and sent individually
 * UUID TRACKING: Each stage links back to original message for audit trail
 */

import { v4 as uuidv4 } from 'uuid';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { chatJSON, callGPTTurbo, detectLanguage } from './openai.js';
import { sendWhatsAppMessage } from './twilio.js';
import { fillTemplate } from '../utils/templateFiller.js';
import {
  PROMPT_SUMMARIZE_MESSAGE_ACTIONS,
  PROMPT_AI_RESPONSE_FROM_SUMMARY,
  PROMPT_ENRICHMENT_CLASSIFY_JSON,
} from '../prompts/index.js';

/**
 * Process a single inbound message through the AI pipeline
 * Equivalent to the combined flow of processSummarizeMessage + buildAiResponseFromSummaries
 * 
 * @param {Object} message - The inbound message record
 * @returns {Array} - Array of generated responses (one per intent)
 */
export async function processInboundMessage(message) {
  const db = getDb();
  const responses = [];

  try {
    console.log(`[MessageProcessor] Processing message ${message.id} from ${message.from_number}`);

    // 1. Get context (booking, property, FAQs, history)
    const context = await getMessageContext(message);
    console.log(`[MessageProcessor] Context: property=${context.propertyId}, booking=${context.bookingId}`);

    // 2. Summarize message into action titles
    const summary = await summarizeMessage(message.body, context.history);
    if (!summary || !summary.actionTitles?.length) {
      console.log('[MessageProcessor] No actionable items found');
      return responses;
    }

    console.log(`[MessageProcessor] Found ${summary.actionTitles.length} action(s): ${summary.actionTitles.join(', ')}`);

    // 3. Process each action title individually (NO CONSOLIDATION)
    for (const actionTitle of summary.actionTitles) {
      const response = await processActionTitle({
        actionTitle,
        message,
        context,
        summary,
      });

      if (response) {
        responses.push(response);

        // 4. Send immediately (each intent as individual message)
        if (response.aiResponse && message.from_number) {
          console.log(`[MessageProcessor] Sending response for: ${actionTitle}`);
          
          await sendWhatsAppMessage({
            to: message.from_number,
            body: response.aiResponse,
            recipientType: 'Guest',
            metadata: {
              propertyId: context.propertyId,
              bookingId: context.bookingId,
              aiEnrichmentId: response.id,
              referenceMessageIds: message.id,
            },
          });

          // Update status to sent and link back to original message
          await db.prepare(`UPDATE ai_logs SET status = 'Sent' WHERE id = ?`).run(response.id);
          
          // Update original message with AI enrichment ID for audit trail
          await db.prepare(`UPDATE messages SET ai_enrichment_id = ? WHERE id = ?`).run(response.id, message.id);
          
          console.log(`[MessageProcessor] Response sent, ai_log=${response.id}`);
        }
      }
    }

    return responses;
  } catch (error) {
    console.error('[MessageProcessor] Error:', error.message, error.stack);
    return responses;
  }
}

/**
 * Summarize message into action titles
 * Equivalent to processSummarizeMessage() from guestResponse.gs
 */
async function summarizeMessage(messageBody, history = '[]') {
  const db = getDb();
  
  // Build prompt with template variables
  const templateVars = {
    HISTORICAL_MESSAGES: history,
    MESSAGE: messageBody,
  };
  const prompt = fillTemplate(PROMPT_SUMMARIZE_MESSAGE_ACTIONS, templateVars);

  console.log('[MessageProcessor] ========================================');
  console.log('[MessageProcessor] === SUMMARIZATION START (v4) ===');
  console.log('[MessageProcessor] ========================================');
  console.log('[MessageProcessor] CURRENT MESSAGE TO ANALYZE:', JSON.stringify(messageBody));
  console.log('[MessageProcessor] History length:', history.length, 'chars');
  console.log('[MessageProcessor] First 200 chars of history:', history.substring(0, 200));
  
  const result = await chatJSON(prompt);
  
  console.log('[MessageProcessor] AI raw response:', result.raw?.substring(0, 300));
  
  // AUDIT: Log to debug_ai_logs for full traceability
  try {
    await db.prepare(`
      INSERT INTO debug_ai_logs (
        function_name, phase, prompt_label, prompt, response, parsed_json, 
        thread_info, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      'summarizeMessage',
      'summarization',
      'PROMPT_SUMMARIZE_MESSAGE_ACTIONS',
      prompt,
      result.raw || result.error || '',
      result.json ? JSON.stringify(result.json) : '',
      JSON.stringify({ message: messageBody, history: history.substring(0, 500) })
    );
    console.log('[MessageProcessor] Logged to debug_ai_logs');
  } catch (logErr) {
    console.error('[MessageProcessor] Failed to log to debug_ai_logs:', logErr.message);
  }
  
  if (result.error || !result.json) {
    console.error('[MessageProcessor] Summarize error:', result.error);
    return null;
  }

  const data = result.json;
  const actionTitles = Array.isArray(data['Action Titles']) 
    ? data['Action Titles'].filter(Boolean) 
    : [];
  
  console.log('[MessageProcessor] Parsed actions:', JSON.stringify(actionTitles));
  
  // Log extracted actions - AI validation is handled by the prompt itself
  const validatedActions = actionTitles;
  
  console.log('[MessageProcessor] Extracted actions:', JSON.stringify(validatedActions));
  
  console.log('[MessageProcessor] Final validated actions:', JSON.stringify(validatedActions));
  console.log('[MessageProcessor] === SUMMARIZATION END ===');
  
  return {
    language: data.Language || 'en',
    tone: data.Tone || '',
    sentiment: data.Sentiment || '',
    actionTitles: validatedActions,
  };
}

/**
 * Process a single action title through enrichment and response generation
 * Equivalent to buildAiResponseFromSummaries() for one action
 */
async function processActionTitle({ actionTitle, message, context, summary }) {
  const db = getDb();
  const id = uuidv4();

  console.log(`[MessageProcessor] Processing action: "${actionTitle}" with id=${id}`);

  // Get category lists for this property
  const { faqsList, tasksList } = await getCategoryLists(context.propertyId);

  // Build enrichment prompt with all context variables
  // CURRENT_MESSAGE is the message we're processing - helps AI focus on the right request
  const templateVars = {
    LANG: summary.language || 'en',
    ACTION_TITLE: actionTitle,
    CURRENT_MESSAGE: message.body || '',  // The latest message being processed
    HISTORICAL_MESSAGES: context.history || '[]',
    BOOKING_DETAILS_JSON: context.bookingJson || '(none)',
    PROPERTY_DETAILS_JSON: context.propertyJson || '(none)',
    PROP_FAQS_JSON: context.faqsJson || '[]',
    FAQS_LIST: faqsList || 'Other',
    TASK_LIST: tasksList || 'Other',
    SUMMARY_JSON: JSON.stringify({
      Language: summary.language,
      Tone: summary.tone,
      Sentiment: summary.sentiment,
    }),
  };
  const prompt = fillTemplate(PROMPT_AI_RESPONSE_FROM_SUMMARY, templateVars);

  console.log('[MessageProcessor] === ENRICHMENT START ===');
  console.log('[MessageProcessor] Action:', actionTitle);
  console.log('[MessageProcessor] FAQs available:', faqsList);
  console.log('[MessageProcessor] Tasks available:', tasksList);
  console.log('[MessageProcessor] Calling AI for enrichment...');
  
  const result = await chatJSON(prompt);

  // AUDIT: Log enrichment to debug_ai_logs
  try {
    await db.prepare(`
      INSERT INTO debug_ai_logs (
        function_name, phase, prompt_label, prompt, response, parsed_json,
        task_scope, thread_info, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      'processActionTitle',
      'enrichment',
      'PROMPT_AI_RESPONSE_FROM_SUMMARY',
      prompt.substring(0, 10000), // Limit size for DB
      result.raw || result.error || '',
      result.json ? JSON.stringify(result.json) : '',
      actionTitle,
      JSON.stringify({
        faqsList,
        tasksList,
        propertyId: context.propertyId,
        bookingId: context.bookingId,
      })
    );
    console.log('[MessageProcessor] Logged enrichment to debug_ai_logs');
  } catch (logErr) {
    console.error('[MessageProcessor] Failed to log enrichment:', logErr.message);
  }

  if (result.error || !result.json) {
    console.error('[MessageProcessor] Enrichment error:', result.error);
    return null;
  }

  const data = result.json;
  console.log('[MessageProcessor] Enrichment result:', JSON.stringify(data));
  console.log('[MessageProcessor] TaskRequired:', data.TaskRequired, 'TaskBucket:', data.TaskBucket);
  console.log('[MessageProcessor] === ENRICHMENT END ===');

  // Build response record
  const response = {
    id,
    recipientType: 'Guest',
    propertyId: context.propertyId,
    bookingId: context.bookingId,
    toNumber: message.from_number,
    messageBundleId: message.id,  // Links back to original message UUID
    originalMessage: actionTitle,
    availablePropertyKnowledge: data.AvailablePropertyKnowledge === 'Yes',
    propertyKnowledgeCategory: data.PropertyKnowledgeCategory || '',
    taskRequired: data.TaskRequired === true || data.TaskRequired === 'Yes',
    taskBucket: data.TaskBucket || '',
    taskRequestTitle: data.TaskRequestTitle || '',
    urgencyIndicators: data.UrgencyIndicators || 'None',
    escalationRiskIndicators: data.EscalationRiskIndicators || 'None',
    aiResponse: data.AiResponse || '',
    ticketEnrichmentJson: JSON.stringify(data),
    status: 'Pending',
  };

  console.log(`[MessageProcessor] Task required: ${response.taskRequired}, bucket: ${response.taskBucket}`);

  // Insert into ai_logs with message_bundle_id for audit trail
  // CRITICAL: Column names must match schema exactly!
  try {
    await db.prepare(`
      INSERT INTO ai_logs (
        id, recipient_type, property_id, booking_id, to_number, message_bundle_id,
        original_message, available_property_knowledge, property_knowledge_category,
        task_required, task_bucket, task_request_title, urgency_indicators,
        escalation_risk_indicators, ai_message_response, ticket_enrichment_json, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      response.id,
      response.recipientType,
      response.propertyId,
      response.bookingId,
      response.toNumber,
      response.messageBundleId,  // UUID of original message
      response.originalMessage,
      response.availablePropertyKnowledge ? 1 : 0,  // INTEGER in schema
      response.propertyKnowledgeCategory,
      response.taskRequired ? 1 : 0,  // INTEGER in schema
      response.taskBucket,
      response.taskRequestTitle,
      response.urgencyIndicators,
      response.escalationRiskIndicators,
      response.aiResponse,
      response.ticketEnrichmentJson,
      response.status
    );
    console.log(`[MessageProcessor] ✓ Inserted ai_log ${response.id}`);
  } catch (insertError) {
    console.error(`[MessageProcessor] ✗ Failed to insert ai_log:`, insertError.message);
    throw insertError;
  }

  return response;
}

/**
 * Get context for message processing (booking, property, FAQs, history)
 */
async function getMessageContext(message) {
  const db = getDb();
  
  let bookingId = message.booking_id;
  let propertyId = message.property_id;

  // Try to lookup booking by phone if not set
  if (!bookingId && message.from_number) {
    const booking = await lookupBookingByPhone(message.from_number);
    if (booking) {
      bookingId = booking.id;
      propertyId = propertyId || booking.property_id;
    }
  }

  // Get booking JSON
  let bookingJson = '(none)';
  if (bookingId) {
    const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    if (booking) {
      bookingJson = booking.details_json || JSON.stringify(booking);
    }
  }

  // Get property JSON
  let propertyJson = '(none)';
  if (propertyId) {
    const property = await db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (property) {
      propertyJson = property.details_json || JSON.stringify(property);
    }
  }

  // Get FAQs
  let faqsJson = '[]';
  if (propertyId) {
    const faqs = await db.prepare('SELECT * FROM faqs WHERE property_id = ?').all(propertyId);
    if (faqs && faqs.length) {
      faqsJson = JSON.stringify(faqs.map(f => ({
        'Sub-Category Name': f.sub_category_name,
        Description: f.description,
        Details: f.details_json ? JSON.parse(f.details_json) : {},
      })));
    }
  }

  // Get conversation history - SCOPED TO BOOKING (like Airbnb)
  // Each booking = fresh conversation. New booking = no history from old bookings.
  // CRITICAL: Exclude the CURRENT message (message.id) from history!
  let history = '[]';
  const phone = message.from_number;
  const currentMessageId = message.id;
  
  console.log(`[Context] ========================================`);
  console.log(`[Context] BUILDING HISTORY FOR BOOKING: ${bookingId || 'NO BOOKING'}`);
  console.log(`[Context] Current message ID: ${currentMessageId}`);
  console.log(`[Context] ========================================`);
  
  if (phone) {
    let messages;
    
    if (bookingId) {
      // BOOKING-SCOPED HISTORY: Only messages from THIS specific booking
      // This ensures a new booking = fresh start with no old booking history
      console.log(`[Context] Fetching history ONLY for booking: ${bookingId}`);
      messages = await db.prepare(`
        SELECT body, message_type, requestor_role, created_at, id
        FROM messages
        WHERE booking_id = ? AND id != ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(bookingId, currentMessageId);
    } else {
      // NO BOOKING: Fallback to phone-based history (only messages with no booking)
      console.log(`[Context] No booking found - using phone-only history (no booking_id)`);
      messages = await db.prepare(`
        SELECT body, message_type, requestor_role, created_at, id
        FROM messages
        WHERE (from_number = ? OR to_number = ?) AND booking_id IS NULL AND id != ?
        ORDER BY created_at DESC
        LIMIT 20
      `).all(phone, phone, currentMessageId);
    }

    if (messages && messages.length) {
      const historyArr = messages.reverse().map(m => {
        const role = m.requestor_role || (m.message_type === 'Inbound' ? 'Guest' : 'Host');
        const direction = m.message_type || 'Inbound';
        return `${role} - ${direction} - ${m.body}`;
      });
      history = JSON.stringify(historyArr);
      console.log(`[Context] Found ${messages.length} history messages for this booking`);
      console.log(`[Context] History preview:`, historyArr.slice(-2)); // Show last 2 messages
    } else {
      console.log(`[Context] No history found - this is the FIRST message for this booking`);
    }
  }

  return {
    bookingId,
    propertyId,
    bookingJson,
    propertyJson,
    faqsJson,
    history,
  };
}

/**
 * Lookup booking by guest phone number
 */
async function lookupBookingByPhone(phone) {
  const db = getDb();
  
  // Normalize phone for comparison
  const normalizedPhone = phone.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
  const pattern = `%${normalizedPhone.slice(-10)}%`;
  
  const now = new Date().toISOString().split('T')[0];
  
  // Try active booking first
  let booking = await db.prepare(`
    SELECT * FROM bookings 
    WHERE guest_phone LIKE ? 
    AND start_date <= ? AND end_date >= ?
    ORDER BY start_date DESC
    LIMIT 1
  `).get(pattern, now, now);

  if (booking) return booking;

  // Try upcoming booking
  booking = await db.prepare(`
    SELECT * FROM bookings 
    WHERE guest_phone LIKE ? 
    AND start_date >= ?
    ORDER BY start_date ASC
    LIMIT 1
  `).get(pattern, now);

  if (booking) return booking;

  // Try most recent past booking
  booking = await db.prepare(`
    SELECT * FROM bookings 
    WHERE guest_phone LIKE ? 
    ORDER BY end_date DESC
    LIMIT 1
  `).get(pattern);

  return booking;
}

/**
 * Get FAQ and task category lists for a property
 */
async function getCategoryLists(propertyId) {
  const db = getDb();

  let faqsList = 'Other';
  let tasksList = 'Other';

  if (propertyId) {
    const faqs = await db.prepare(`
      SELECT DISTINCT sub_category_name FROM faqs WHERE property_id = ?
    `).all(propertyId);
    
    if (faqs && faqs.length) {
      faqsList = faqs.map(f => f.sub_category_name).join(', ');
    }

    const tasks = await db.prepare(`
      SELECT DISTINCT sub_category_name FROM task_definitions WHERE property_id = ?
    `).all(propertyId);

    if (tasks && tasks.length) {
      tasksList = tasks.map(t => t.sub_category_name).join(', ');
    }
  }

  return { faqsList, tasksList };
}

/**
 * Process pending AI log entries and send messages
 * Called periodically or after batch processing
 */
export async function processPendingAiLogs() {
  const db = getDb();

  // Get all pending entries
  const pending = await db.prepare(`
    SELECT * FROM ai_logs 
    WHERE status = 'Pending' AND ai_message_response IS NOT NULL
    ORDER BY created_at ASC
  `).all();

  if (!pending || !pending.length) return [];

  const results = [];

  // Process each entry individually (NO CONSOLIDATION)
  for (const entry of pending) {
    if (!entry.to_number || !entry.ai_message_response) continue;

    const result = await sendWhatsAppMessage({
      to: entry.to_number,
      body: entry.ai_message_response,
      recipientType: entry.recipient_type || 'Guest',
      metadata: {
        propertyId: entry.property_id,
        bookingId: entry.booking_id,
        aiEnrichmentId: entry.id,
        taskId: entry.task_uuid,
      },
    });

    // Update status
    const newStatus = result.success ? 'Sent' : 'Error';
    await db.prepare(`UPDATE ai_logs SET status = ? WHERE id = ?`).run(newStatus, entry.id);

    results.push({ entry, result });
  }

  return results;
}

export default {
  processInboundMessage,
  processPendingAiLogs,
  lookupBookingByPhone,
  getCategoryLists,
};
