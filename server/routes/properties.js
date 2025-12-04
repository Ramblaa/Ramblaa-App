/**
 * Properties Routes
 * API endpoints for property and booking management
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDbWithPrepare as getDb } from '../db/index.js';

const router = Router();

/**
 * GET /api/properties
 * Get all properties
 */
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { limit = 100 } = req.query;

    const properties = db.prepare(`
      SELECT p.*,
        (SELECT COUNT(*) FROM bookings b WHERE b.property_id = p.id) as booking_count,
        (SELECT COUNT(*) FROM tasks t WHERE t.property_id = p.id AND t.status != 'Completed') as active_tasks
      FROM properties p
      ORDER BY p.name ASC
      LIMIT ?
    `).all(parseInt(limit, 10));

    res.json(properties.map(p => ({
      id: p.id,
      name: p.name,
      address: p.address,
      hostPhone: p.host_phone,
      hostName: p.host_name,
      bookingCount: p.booking_count,
      activeTasks: p.active_tasks,
      createdAt: p.created_at,
    })));
  } catch (error) {
    console.error('[Properties] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/properties/:id
 * Get property details
 */
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get active bookings
    const today = new Date().toISOString().split('T')[0];
    const bookings = db.prepare(`
      SELECT * FROM bookings 
      WHERE property_id = ? AND end_date >= ?
      ORDER BY start_date ASC
    `).all(id, today);

    // Get FAQs
    const faqs = db.prepare('SELECT * FROM faqs WHERE property_id = ?').all(id);

    // Get task definitions
    const taskDefs = db.prepare('SELECT * FROM task_definitions WHERE property_id = ?').all(id);

    // Get staff
    const staff = db.prepare('SELECT * FROM staff WHERE property_id = ?').all(id);

    res.json({
      ...property,
      details: property.details_json ? JSON.parse(property.details_json) : {},
      bookings: bookings.map(b => ({
        id: b.id,
        guestName: b.guest_name,
        guestPhone: b.guest_phone,
        startDate: b.start_date,
        endDate: b.end_date,
        details: b.details_json ? JSON.parse(b.details_json) : {},
      })),
      faqs: faqs.map(f => ({
        id: f.id,
        subCategory: f.sub_category_name,
        description: f.description,
        details: f.details_json ? JSON.parse(f.details_json) : {},
      })),
      taskDefinitions: taskDefs.map(t => ({
        id: t.id,
        subCategory: t.sub_category_name,
        staffRequirements: t.staff_requirements,
        guestRequirements: t.guest_requirements,
        hostEscalation: t.host_escalation,
        staffName: t.staff_name,
        staffPhone: t.staff_phone,
      })),
      staff: staff.map(s => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        role: s.role,
      })),
    });
  } catch (error) {
    console.error('[Properties] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/properties
 * Create a new property
 */
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const { name, address, hostPhone, hostName, details } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const id = uuidv4();

    db.prepare(`
      INSERT INTO properties (id, name, address, host_phone, host_name, details_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      id,
      name,
      address || null,
      hostPhone || null,
      hostName || null,
      details ? JSON.stringify(details) : null
    );

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    res.status(201).json(property);
  } catch (error) {
    console.error('[Properties] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/properties/:id
 * Update property
 */
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Property not found' });
    }

    const fields = [];
    const values = [];

    if (updates.name !== undefined) { fields.push('name = ?'); values.push(updates.name); }
    if (updates.address !== undefined) { fields.push('address = ?'); values.push(updates.address); }
    if (updates.hostPhone !== undefined) { fields.push('host_phone = ?'); values.push(updates.hostPhone); }
    if (updates.hostName !== undefined) { fields.push('host_name = ?'); values.push(updates.hostName); }
    if (updates.details !== undefined) { fields.push('details_json = ?'); values.push(JSON.stringify(updates.details)); }

    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      db.prepare(`UPDATE properties SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
    res.json(property);
  } catch (error) {
    console.error('[Properties] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// BOOKINGS
// ============================================================================

/**
 * GET /api/properties/:id/bookings
 * Get bookings for a property
 */
router.get('/:id/bookings', (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.query;
    const db = getDb();

    let sql = 'SELECT * FROM bookings WHERE property_id = ?';
    const params = [id];

    if (active === 'true') {
      const today = new Date().toISOString().split('T')[0];
      sql += ' AND end_date >= ?';
      params.push(today);
    }

    sql += ' ORDER BY start_date DESC';

    const bookings = db.prepare(sql).all(...params);

    res.json(bookings.map(b => ({
      id: b.id,
      propertyId: b.property_id,
      guestName: b.guest_name,
      guestPhone: b.guest_phone,
      guestEmail: b.guest_email,
      startDate: b.start_date,
      endDate: b.end_date,
      details: b.details_json ? JSON.parse(b.details_json) : {},
      createdAt: b.created_at,
    })));
  } catch (error) {
    console.error('[Bookings] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/properties/:id/bookings
 * Create a booking
 */
router.post('/:id/bookings', (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { guestName, guestPhone, guestEmail, startDate, endDate, details } = req.body;
    const db = getDb();

    if (!guestName || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields: guestName, startDate, endDate' });
    }

    const id = uuidv4();

    db.prepare(`
      INSERT INTO bookings (id, property_id, guest_name, guest_phone, guest_email, start_date, end_date, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      propertyId,
      guestName,
      guestPhone || null,
      guestEmail || null,
      startDate,
      endDate,
      details ? JSON.stringify(details) : null
    );

    const booking = db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    res.status(201).json(booking);
  } catch (error) {
    console.error('[Bookings] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// FAQS
// ============================================================================

/**
 * GET /api/properties/:id/faqs
 * Get FAQs for a property
 */
router.get('/:id/faqs', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const faqs = db.prepare('SELECT * FROM faqs WHERE property_id = ? ORDER BY sub_category_name').all(id);

    res.json(faqs.map(f => ({
      id: f.id,
      propertyId: f.property_id,
      subCategory: f.sub_category_name,
      description: f.description,
      details: f.details_json ? JSON.parse(f.details_json) : {},
      createdAt: f.created_at,
    })));
  } catch (error) {
    console.error('[FAQs] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/properties/:id/faqs
 * Create an FAQ
 */
router.post('/:id/faqs', (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { subCategory, description, details } = req.body;
    const db = getDb();

    if (!subCategory) {
      return res.status(400).json({ error: 'Missing required field: subCategory' });
    }

    const stmt = db.prepare(`
      INSERT INTO faqs (property_id, sub_category_name, description, details_json)
      VALUES (?, ?, ?, ?)
    `);

    const result = stmt.run(
      propertyId,
      subCategory,
      description || null,
      details ? JSON.stringify(details) : null
    );

    const faq = db.prepare('SELECT * FROM faqs WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(faq);
  } catch (error) {
    console.error('[FAQs] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// STAFF
// ============================================================================

/**
 * GET /api/properties/:id/staff
 * Get staff for a property
 */
router.get('/:id/staff', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const staff = db.prepare('SELECT * FROM staff WHERE property_id = ?').all(id);

    res.json(staff.map(s => ({
      id: s.id,
      propertyId: s.property_id,
      name: s.name,
      phone: s.phone,
      role: s.role,
      preferredLanguage: s.preferred_language,
      details: s.details_json ? JSON.parse(s.details_json) : {},
      createdAt: s.created_at,
    })));
  } catch (error) {
    console.error('[Staff] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/properties/:id/staff
 * Create a staff member
 */
router.post('/:id/staff', (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { name, phone, role, preferredLanguage, details } = req.body;
    const db = getDb();

    if (!name || !phone) {
      return res.status(400).json({ error: 'Missing required fields: name, phone' });
    }

    const id = uuidv4();

    db.prepare(`
      INSERT INTO staff (id, property_id, name, phone, role, preferred_language, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      propertyId,
      name,
      phone,
      role || 'Staff',
      preferredLanguage || 'en',
      details ? JSON.stringify(details) : null
    );

    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
    res.status(201).json(staff);
  } catch (error) {
    console.error('[Staff] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// SEED DATA (Temporary - for testing)
// ============================================================================

/**
 * POST /api/properties/seed
 * Seed test data into the database
 */
router.post('/seed', async (req, res) => {
  try {
    const db = getDb();
    const propertyData = req.body;

    // Create property ID from the Property Id field or generate one
    const propertyId = propertyData['Property Id']?.toString() || uuidv4();

    // Check if property exists
    const existing = db.prepare('SELECT id FROM properties WHERE id = ?').get(propertyId);
    
    if (existing) {
      // Update existing
      db.prepare(`
        UPDATE properties SET
          name = ?, address = ?, host_phone = ?, host_name = ?, details_json = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        propertyData['Property Title'] || propertyData['Internal Name'] || 'Test Property',
        propertyData['Property Location'] || '',
        propertyData['Host Phone'] || '',
        propertyData['Host'] || '',
        JSON.stringify(propertyData),
        propertyId
      );
    } else {
      // Insert new
      db.prepare(`
        INSERT INTO properties (id, name, address, host_phone, host_name, details_json)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        propertyId,
        propertyData['Property Title'] || propertyData['Internal Name'] || 'Test Property',
        propertyData['Property Location'] || '',
        propertyData['Host Phone'] || '',
        propertyData['Host'] || '',
        JSON.stringify(propertyData)
      );
    }

    // Create a test booking
    const bookingId = uuidv4();
    const today = new Date();
    const startDate = today.toISOString().split('T')[0];
    const endDate = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const existingBooking = db.prepare('SELECT id FROM bookings WHERE property_id = ?').get(propertyId);
    if (!existingBooking) {
      db.prepare(`
        INSERT INTO bookings (id, property_id, guest_name, guest_phone, start_date, end_date, details_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        bookingId,
        propertyId,
        'Test Guest',
        'whatsapp:+31630211666',
        startDate,
        endDate,
        JSON.stringify({ platform: propertyData['Platform'] || 'Airbnb' })
      );
    }

    // Create sample messages
    const existingMessages = db.prepare('SELECT COUNT(*) as count FROM messages WHERE property_id = ?').get(propertyId);
    if (existingMessages.count === 0) {
      const msgId1 = uuidv4();
      const msgId2 = uuidv4();

      db.prepare(`
        INSERT INTO messages (id, property_id, booking_id, from_number, to_number, body, message_type, requestor_role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-1 hour'))
      `).run(msgId1, propertyId, bookingId, 'whatsapp:+31630211666', 'whatsapp:+14155238886', 
        'Hi! What is the WiFi password?', 'Inbound', 'Guest');

      db.prepare(`
        INSERT INTO messages (id, property_id, booking_id, from_number, to_number, body, message_type, requestor_role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', '-30 minutes'))
      `).run(msgId2, propertyId, bookingId, 'whatsapp:+14155238886', 'whatsapp:+31630211666',
        `The WiFi network is "${propertyData['Wifi Network Name'] || 'kaum_villa'}" and the password is "${propertyData['Wifi Password'] || 'balilestari'}". Enjoy your stay!`,
        'Outbound', 'Host');
    }

    // Create a sample task
    const existingTasks = db.prepare('SELECT COUNT(*) as count FROM tasks WHERE property_id = ?').get(propertyId);
    if (existingTasks.count === 0) {
      const taskId = uuidv4();
      db.prepare(`
        INSERT INTO tasks (id, property_id, booking_id, phone, task_request_title, guest_message, task_bucket, action_holder, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(taskId, propertyId, bookingId, 'whatsapp:+31630211666',
        'Pool towels request', 'Can we get extra pool towels please?', 'Cleaning', 'Staff', 'Waiting on Staff');
    }

    // Add WiFi FAQ
    const existingFaq = db.prepare('SELECT id FROM faqs WHERE property_id = ? AND sub_category_name = ?').get(propertyId, 'WiFi');
    if (!existingFaq) {
      db.prepare(`
        INSERT INTO faqs (property_id, sub_category_name, description, details_json)
        VALUES (?, ?, ?, ?)
      `).run(
        propertyId,
        'WiFi',
        `Network: ${propertyData['Wifi Network Name'] || 'kaum_villa'}, Password: ${propertyData['Wifi Password'] || 'balilestari'}`,
        JSON.stringify({ ssid: propertyData['Wifi Network Name'], password: propertyData['Wifi Password'] })
      );
    }

    // Return seeded data
    const property = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    const bookings = db.prepare('SELECT * FROM bookings WHERE property_id = ?').all(propertyId);
    const messages = db.prepare('SELECT * FROM messages WHERE property_id = ?').all(propertyId);
    const tasks = db.prepare('SELECT * FROM tasks WHERE property_id = ?').all(propertyId);
    const faqs = db.prepare('SELECT * FROM faqs WHERE property_id = ?').all(propertyId);

    res.json({
      message: 'Data seeded successfully',
      property,
      bookings,
      messages,
      tasks,
      faqs
    });
  } catch (error) {
    console.error('[Seed] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

