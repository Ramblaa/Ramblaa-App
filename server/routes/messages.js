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
 * Get all conversations (grouped by phone number)
 */
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { propertyId, limit = 50 } = req.query;

    // Get unique phone numbers with their latest message
    let sql = `
      SELECT 
        m.*,
        b.guest_name,
        p.name as property_name,
        (
          SELECT COUNT(*) FROM messages m2 
          WHERE (m2.from_number = m.from_number OR m2.to_number = m.from_number)
        ) as message_count
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
      GROUP BY m.from_number
      ORDER BY m.created_at DESC
      LIMIT ?
    `;
    params.push(parseInt(limit, 10));

    const conversations = await db.prepare(sql).all(...params);

    // Format response
    const formatted = conversations.map(conv => ({
      id: conv.id,
      phone: conv.from_number,
      guestName: conv.guest_name || formatPhoneForDisplay(conv.from_number),
      property: conv.property_name || 'Unknown Property',
      propertyId: conv.property_id,
      bookingId: conv.booking_id,
      lastMessage: conv.body || '',
      timestamp: conv.created_at,
      messageCount: conv.message_count,
      requestorRole: conv.requestor_role,
    }));

    res.json(formatted);
  } catch (error) {
    console.error('[Messages] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/messages/:phone
 * Get conversation history for a phone number
 */
router.get('/:phone', async (req, res) => {
  try {
    const db = getDb();
    const { phone } = req.params;
    const { limit = 100 } = req.query;

    // Normalize phone for lookup
    const tokens = canonPhoneTokens(phone);
    const pattern = `%${tokens.last10}%`;

    // Get all messages for this phone
    const messages = await db.prepare(`
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
      WHERE m.from_number LIKE ? OR m.to_number LIKE ?
      ORDER BY m.created_at ASC
      LIMIT ?
    `).all(pattern, pattern, parseInt(limit, 10));

    // Get conversation metadata
    const firstMsg = messages[0];
    let guestName = formatPhoneForDisplay(phone);
    let propertyName = 'Unknown Property';
    let bookingId = null;
    let propertyId = null;

    if (firstMsg?.booking_id) {
      const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(firstMsg.booking_id);
      if (booking) {
        guestName = booking.guest_name || guestName;
        bookingId = booking.id;
        propertyId = booking.property_id;
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
    }));

    res.json({
      phone: tokens.e164 || phone,
      guestName,
      property: propertyName,
      propertyId,
      bookingId,
      messages: formatted,
      autoResponseEnabled: true, // Could be stored per-conversation
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

