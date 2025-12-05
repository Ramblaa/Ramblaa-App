/**
 * Messages Routes
 * API endpoints for message management
 */

import { Router } from 'express';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { sendWhatsAppMessage } from '../services/twilio.js';
import { canonPhoneTokens } from '../utils/phoneUtils.js';

const router = Router();

/**
 * GET /api/messages
 * Get all conversations (grouped by BOOKING - like Airbnb)
 * Each booking has its own separate chat thread
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { propertyId, limit = 50 } = req.query;

    // Get conversations grouped by BOOKING (not phone number)
    // This ensures each booking has its own chat history
    let sql = `
      SELECT DISTINCT ON (COALESCE(m.booking_id, m.from_number))
        m.id, m.from_number, m.to_number, m.body, m.created_at, m.message_type,
        m.requestor_role, m.property_id, m.booking_id,
        b.guest_name, b.start_date, b.end_date,
        p.name as property_name
      FROM messages m
      LEFT JOIN bookings b ON m.booking_id = b.id
      LEFT JOIN properties p ON m.property_id = p.id
      WHERE m.message_type = 'Inbound'
    `;

    const params = [];

    if (propertyId) {
      sql += ' AND m.property_id = ?';
      params.push(propertyId);
    }

    sql += `
      ORDER BY COALESCE(m.booking_id, m.from_number), m.created_at DESC
      LIMIT ?
    `;
    params.push(parseInt(limit, 10));

    const conversations = await db.prepare(sql).all(...params);

    // Format response with booking info
    const formatted = conversations.map(conv => {
      // Build guest name with booking dates if available
      let displayName = conv.guest_name || formatPhoneForDisplay(conv.from_number);
      if (conv.start_date && conv.end_date) {
        const start = new Date(conv.start_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        const end = new Date(conv.end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        displayName = `${displayName} (${start} - ${end})`;
      }

      return {
        id: conv.booking_id || conv.id, // Use booking_id as conversation ID when available
        phone: conv.from_number,
        guestName: displayName,
        property: conv.property_name || 'Unknown Property',
        propertyId: conv.property_id,
        bookingId: conv.booking_id,
        lastMessage: conv.body || '',
        timestamp: conv.created_at,
        messageCount: 1,
        requestorRole: conv.requestor_role,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('[Messages] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/messages/:id
 * Get conversation history for a booking or phone number
 * :id can be a booking_id (UUID) or phone number
 */
router.get('/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    const { limit = 100 } = req.query;

    let messages;

    // Check if id looks like a UUID (booking_id) or phone number
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

    if (isUUID) {
      // Fetch messages by booking_id - scoped to this booking only
      messages = await db.prepare(`
        SELECT m.*, 
          CASE 
            WHEN m.message_type = 'Inbound' THEN 'guest'
            ELSE 'host'
          END as sender,
          CASE
            WHEN m.requestor_role = 'Staff' THEN 'staff'
            WHEN m.requestor_role = 'Host' THEN 'host'
            ELSE 'rambley'
          END as sender_type
        FROM messages m
        WHERE m.booking_id = ?
        ORDER BY m.created_at ASC
        LIMIT ?
      `).all(id, parseInt(limit, 10));
    } else {
      // Fallback: fetch by phone for messages without booking
      const tokens = canonPhoneTokens(id);
      const pattern = `%${tokens.last10}%`;

      messages = await db.prepare(`
        SELECT m.*, 
          CASE 
            WHEN m.message_type = 'Inbound' THEN 'guest'
            ELSE 'host'
          END as sender,
          CASE
            WHEN m.requestor_role = 'Staff' THEN 'staff'
            WHEN m.requestor_role = 'Host' THEN 'host'
            ELSE 'rambley'
          END as sender_type
        FROM messages m
        WHERE (m.from_number LIKE ? OR m.to_number LIKE ?) AND m.booking_id IS NULL
        ORDER BY m.created_at ASC
        LIMIT ?
    `).all(pattern, pattern, parseInt(limit, 10));
    }

    // Get conversation metadata
    const firstMsg = messages[0];
    let guestName = formatPhoneForDisplay(id);
    let propertyName = 'Unknown Property';
    let bookingId = isUUID ? id : null;
    let propertyId = null;
    let phone = id;

    if (isUUID || firstMsg?.booking_id) {
      const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(isUUID ? id : firstMsg.booking_id);
      if (booking) {
        guestName = booking.guest_name || guestName;
        bookingId = booking.id;
        propertyId = booking.property_id;
        phone = booking.guest_phone || phone;
      }
    }

    if (firstMsg?.property_id || propertyId) {
      const property = await db.prepare('SELECT * FROM properties WHERE id = ?').get(firstMsg?.property_id || propertyId);
      if (property) {
        propertyName = property.name;
        propertyId = property.id;
      }
    }

    // Format messages
    const formatted = messages.map(msg => ({
      id: msg.id,
      text: msg.body,
      sender: msg.sender,
      senderType: msg.sender_type,
      timestamp: new Date(msg.created_at).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }),
      createdAt: msg.created_at,
      taskIds: msg.reference_task_ids ? msg.reference_task_ids.split(',').filter(Boolean) : [],
      taskAction: msg.task_action || null,  // 'created' or 'updated'
    }));

    res.json({
      phone,
      guestName,
      property: propertyName,
      propertyId,
      bookingId,
      messages: formatted,
      autoResponseEnabled: true,
    });
  } catch (error) {
    console.error('[Messages] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/messages/send
 * Send a manual message
 */
router.post('/send', async (req, res) => {
  try {
    const { to, body, propertyId, bookingId } = req.body;

    if (!to || !body) {
      return res.status(400).json({ error: 'Missing required fields: to, body' });
    }

    const result = await sendWhatsAppMessage({
      to,
      body,
      recipientType: 'Guest',
      metadata: {
        propertyId,
        bookingId,
      },
    });

    if (result.success) {
      res.json({
        success: true,
        messageSid: result.messageSid,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('[Messages] Send error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Format phone number for display
 */
function formatPhoneForDisplay(phone) {
  const cleaned = (phone || '').replace(/^whatsapp:/i, '');
  if (cleaned.length === 12 && cleaned.startsWith('+1')) {
    return `(${cleaned.slice(2, 5)}) ${cleaned.slice(5, 8)}-${cleaned.slice(8)}`;
  }
  return cleaned;
}

export default router;

