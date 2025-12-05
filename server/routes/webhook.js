/**
 * Webhook Routes - Ported from twilioApiWebhook.gs
 * Handles inbound Twilio WhatsApp messages
 * 
 * UUID TRACKING: Each inbound message gets a UUID stored in messages.id
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { canonPhoneTokens, normalizeWhatsAppPhone } from '../utils/phoneUtils.js';
import { processInboundMessage } from '../services/messageProcessor.js';
import { createTasksFromAiLogs, processTaskWorkflow } from '../services/taskManager.js';
import { sendToWebhook, fetchTwilioMedia } from '../services/twilio.js';

const router = Router();

/**
 * POST /api/webhook/twilio
 * Receive inbound WhatsApp messages from Twilio
 */
router.post('/twilio', async (req, res) => {
  try {
    const params = req.body;
    console.log('[Webhook] Received:', JSON.stringify(params));

    const from = normalizeWhatsAppPhone(params.From);
    const to = normalizeWhatsAppPhone(params.To);
    const body = String(params.Body || '');
    const messageSid = params.MessageSid || params.SmsMessageSid || '';
    const numMedia = parseInt(params.NumMedia || '0', 10) || 0;

    // Generate UUID for message tracking
    const id = messageSid || uuidv4();
    const db = getDb();

    console.log(`[Webhook] Processing message ${id} from ${from}`);

    // Handle media attachments
    const mediaUrls = [];
    if (numMedia > 0) {
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params[`MediaUrl${i}`];
        if (mediaUrl) {
          mediaUrls.push(mediaUrl);
        }
      }
    }

    // Determine requestor role and parse message body
    let bookingId = null;
    let propertyId = null;
    let requestorRole = '';
    let staffId = null;
    let actualBody = body; // Body with prefix stripped for processing

    // Check for role prefix (staff: or host:) - for testing with single phone number
    const prefixMatch = body.match(/^\s*(staff|host)\s*:\s*/i);
    if (prefixMatch) {
      requestorRole = prefixMatch[1].toLowerCase() === 'staff' ? 'Staff' : 'Host';
      actualBody = body.slice(prefixMatch[0].length).trim(); // Strip prefix from body
      console.log(`[Webhook] Role prefix detected: ${requestorRole}, message: "${actualBody}"`);
      
      // For prefixed messages, look up staff/host by phone to get property context
      const staffRecord = await lookupStaffByPhone(db, from, requestorRole);
      if (staffRecord) {
        propertyId = staffRecord.property_id;
        staffId = staffRecord.id;
        console.log(`[Webhook] Found ${requestorRole.toLowerCase()}: ${staffRecord.name}, property: ${propertyId}`);
      } else {
        // If no staff record, try to find any property they're associated with
        const anyStaff = await db.prepare(`
          SELECT property_id, id FROM staff WHERE phone LIKE ? LIMIT 1
        `).get(`%${from.replace(/\D/g, '').slice(-10)}%`);
        if (anyStaff) {
          propertyId = anyStaff.property_id;
          staffId = anyStaff.id;
        }
      }
    } else {
      // No prefix - determine role from database lookups
      
      // Try to find booking by phone (Guest)
      const booking = await lookupBookingByPhone(db, from);
      if (booking) {
        bookingId = booking.id;
        propertyId = booking.property_id;
        requestorRole = 'Guest';
        console.log(`[Webhook] Found booking: ${bookingId}, property: ${propertyId}`);
      }

      // Try to find staff record
      if (!requestorRole) {
        const staff = await lookupStaffByPhone(db, from, 'Staff');
        if (staff) {
          requestorRole = 'Staff';
          propertyId = propertyId || staff.property_id;
          staffId = staff.id;
          console.log(`[Webhook] Found staff: ${staff.name}`);
        }
      }

      // Try to find host record
      if (!requestorRole) {
        const host = await lookupStaffByPhone(db, from, 'Host');
        if (host) {
          requestorRole = 'Host';
          propertyId = propertyId || host.property_id;
          console.log(`[Webhook] Found host: ${host.name}`);
        }
      }

      // Default to Guest
      if (!requestorRole) {
        requestorRole = 'Guest';
        console.log('[Webhook] Defaulting to Guest role');
      }
    }

    // Insert message into database with UUID (store original body for audit, use actualBody for processing)
    await db.prepare(`
      INSERT INTO messages (
        id, from_number, to_number, body, media_url, message_type,
        requestor_role, booking_id, property_id, staff_id, created_at
      ) VALUES (?, ?, ?, ?, ?, 'Inbound', ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      id,
      from,
      to,
      body, // Store original body with prefix for audit trail
      mediaUrls.join(', ') || null,
      requestorRole,
      bookingId,
      propertyId,
      staffId
    );

    console.log(`[Webhook] Logged message: ${id}, role=${requestorRole}, property=${propertyId}, body="${actualBody.substring(0, 50)}..."`);

    // Send to external webhook (if configured)
    try {
      await sendToWebhook({
        messageSid: id,
        from,
        to,
        body,
        type: 'Inbound',
        bookingId,
        propertyId,
        requestorRole,
        staffId,
        mediaUrls,
      });
    } catch (e) {
      console.error('[Webhook] External webhook error:', e.message);
    }

    // Process the message based on role
    if (actualBody.trim()) {
      if (requestorRole === 'Guest') {
        // Guest message: Process through AI pipeline
        const message = {
          id,
          from_number: from,
          to_number: to,
          body: actualBody, // Use stripped body for AI processing
          booking_id: bookingId,
          property_id: propertyId,
          requestor_role: requestorRole,
        };

        // Process asynchronously - don't block the response
        processInboundMessage(message)
          .then(async (responses) => {
            console.log(`[Webhook] AI processed ${responses.length} response(s)`);
            
            // After AI processing, create tasks if needed
            const tasksCreated = await createTasksFromAiLogs();
            if (tasksCreated.length > 0) {
              console.log(`[Webhook] Created ${tasksCreated.length} task(s)`);
              
              // Process task workflow (notify staff/host)
              const workflowResults = await processTaskWorkflow();
              console.log(`[Webhook] Task workflow processed: ${workflowResults.length} action(s)`);
            }
          })
          .catch(err => {
            console.error('[Webhook] AI processing error:', err.message, err.stack);
          });
      } else if (requestorRole === 'Staff' || requestorRole === 'Host') {
        // Staff/Host message: Process as task response
        console.log(`[Webhook] Processing ${requestorRole} response: "${actualBody.substring(0, 50)}..."`);
        
        // Import task handler for staff/host responses
        import('../services/taskManager.js').then(async ({ processStaffHostResponse }) => {
          if (processStaffHostResponse) {
            try {
              const result = await processStaffHostResponse({
                messageId: id,
                from,
                body: actualBody,
                role: requestorRole,
                propertyId,
                staffId,
              });
              console.log(`[Webhook] ${requestorRole} response processed:`, result);
            } catch (err) {
              console.error(`[Webhook] ${requestorRole} response processing error:`, err.message);
            }
          } else {
            console.log(`[Webhook] ${requestorRole} message logged (no active task handler)`);
          }
        });
      }
    }

    // Return TwiML empty response immediately
    res.type('text/xml');
    res.send('<Response></Response>');
  } catch (error) {
    console.error('[Webhook] Error:', error.message, error.stack);
    res.status(500).send('<Response></Response>');
  }
});

/**
 * GET /api/webhook/health
 * Health check for webhook endpoint
 */
router.get('/health', (req, res) => {
  res.json({ status: 'ok', endpoint: 'webhook' });
});

/**
 * POST /api/webhook/process-tasks
 * Manually trigger task creation and workflow processing
 */
router.post('/process-tasks', async (req, res) => {
  try {
    console.log('[Webhook] Manual task processing triggered');
    
    // Create tasks from AI logs
    const tasksCreated = await createTasksFromAiLogs();
    console.log(`[Webhook] Created ${tasksCreated.length} task(s)`);
    
    // Process task workflow
    const workflowResults = await processTaskWorkflow();
    console.log(`[Webhook] Workflow processed ${workflowResults.length} action(s)`);
    
    res.json({
      success: true,
      tasksCreated: tasksCreated.length,
      workflowActions: workflowResults.length,
      tasks: tasksCreated.map(t => ({
        id: t.id,
        bucket: t.task_bucket,
        status: t.status,
        staff: t.staff_name,
      })),
    });
  } catch (error) {
    console.error('[Webhook] Process tasks error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Lookup booking by guest phone
 */
async function lookupBookingByPhone(db, phone) {
  const tokens = canonPhoneTokens(phone);
  if (!tokens.digits) return null;

  const pattern = `%${tokens.last10}%`;
  const today = new Date().toISOString().split('T')[0];

  // Active booking
  let booking = await db.prepare(`
    SELECT * FROM bookings 
    WHERE guest_phone LIKE ? AND start_date <= ? AND end_date >= ?
    ORDER BY start_date DESC LIMIT 1
  `).get(pattern, today, today);

  if (booking) return booking;

  // Upcoming booking
  booking = await db.prepare(`
    SELECT * FROM bookings 
    WHERE guest_phone LIKE ? AND start_date >= ?
    ORDER BY start_date ASC LIMIT 1
  `).get(pattern, today);

  if (booking) return booking;

  // Most recent past booking
  booking = await db.prepare(`
    SELECT * FROM bookings 
    WHERE guest_phone LIKE ?
    ORDER BY end_date DESC LIMIT 1
  `).get(pattern);

  return booking;
}

/**
 * Lookup staff/host by phone and role
 */
async function lookupStaffByPhone(db, phone, role) {
  const tokens = canonPhoneTokens(phone);
  if (!tokens.digits) return null;

  const pattern = `%${tokens.last10}%`;

  return await db.prepare(`
    SELECT * FROM staff 
    WHERE phone LIKE ? AND LOWER(role) = LOWER(?)
    LIMIT 1
  `).get(pattern, role);
}

export default router;
