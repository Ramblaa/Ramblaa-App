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
router.get('/', async (req, res) => {
  try {
    const db = getDb();
    const { limit = 100 } = req.query;

    const properties = await db.prepare(`
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
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const property = await db.prepare('SELECT * FROM properties WHERE id = ?').get(id);

    if (!property) {
      return res.status(404).json({ error: 'Property not found' });
    }

    // Get active bookings
    const today = new Date().toISOString().split('T')[0];
    const bookings = await db.prepare(`
      SELECT * FROM bookings 
      WHERE property_id = ? AND end_date >= ?
      ORDER BY start_date ASC
    `).all(id, today);

    // Get FAQs
    const faqs = await db.prepare('SELECT * FROM faqs WHERE property_id = ?').all(id);

    // Get task definitions
    const taskDefs = await db.prepare('SELECT * FROM task_definitions WHERE property_id = ?').all(id);

    // Get staff
    const staff = await db.prepare('SELECT * FROM staff WHERE property_id = ?').all(id);

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
router.post('/', async (req, res) => {
  try {
    const db = getDb();
    const { name, address, hostPhone, hostName, details } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Missing required field: name' });
    }

    const id = uuidv4();

    await db.prepare(`
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

    const property = await db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
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
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
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
      await db.prepare(`UPDATE properties SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    }

    const property = await db.prepare('SELECT * FROM properties WHERE id = ?').get(id);
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
router.get('/:id/bookings', async (req, res) => {
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

    const bookings = await db.prepare(sql).all(...params);

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
router.post('/:id/bookings', async (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { guestName, guestPhone, guestEmail, startDate, endDate, details } = req.body;
    const db = getDb();

    if (!guestName || !startDate || !endDate) {
      return res.status(400).json({ error: 'Missing required fields: guestName, startDate, endDate' });
    }

    const id = uuidv4();

    await db.prepare(`
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

    const booking = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(id);
    res.status(201).json(booking);
  } catch (error) {
    console.error('[Bookings] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/properties/:id/bookings/:bookingId
 * Update a booking
 */
router.put('/:id/bookings/:bookingId', async (req, res) => {
  try {
    const { id: propertyId, bookingId } = req.params;
    const { guestName, guestPhone, guestEmail, startDate, endDate, details } = req.body;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM bookings WHERE id = ? AND property_id = ?').get(bookingId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await db.prepare(`
      UPDATE bookings 
      SET guest_name = ?, guest_phone = ?, guest_email = ?, start_date = ?, end_date = ?, details_json = ?
      WHERE id = ?
    `).run(
      guestName || existing.guest_name,
      guestPhone !== undefined ? guestPhone : existing.guest_phone,
      guestEmail !== undefined ? guestEmail : existing.guest_email,
      startDate || existing.start_date,
      endDate || existing.end_date,
      details ? JSON.stringify(details) : existing.details_json,
      bookingId
    );

    const updated = await db.prepare('SELECT * FROM bookings WHERE id = ?').get(bookingId);
    res.json({
      id: updated.id,
      propertyId: updated.property_id,
      guestName: updated.guest_name,
      guestPhone: updated.guest_phone,
      guestEmail: updated.guest_email,
      startDate: updated.start_date,
      endDate: updated.end_date,
      details: updated.details_json ? JSON.parse(updated.details_json) : {},
      createdAt: updated.created_at,
    });
  } catch (error) {
    console.error('[Bookings] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/properties/:id/bookings/:bookingId
 * Delete a booking
 */
router.delete('/:id/bookings/:bookingId', async (req, res) => {
  try {
    const { id: propertyId, bookingId } = req.params;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM bookings WHERE id = ? AND property_id = ?').get(bookingId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    await db.prepare('DELETE FROM bookings WHERE id = ?').run(bookingId);
    res.json({ success: true, id: bookingId });
  } catch (error) {
    console.error('[Bookings] Delete error:', error);
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
router.get('/:id/faqs', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const faqs = await db.prepare('SELECT * FROM faqs WHERE property_id = ? ORDER BY sub_category_name').all(id);

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
router.post('/:id/faqs', async (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { subCategory, description, details } = req.body;
    const db = getDb();

    if (!subCategory) {
      return res.status(400).json({ error: 'Missing required field: subCategory' });
    }

    const result = await db.prepare(`
      INSERT INTO faqs (property_id, sub_category_name, description, details_json)
      VALUES (?, ?, ?, ?) RETURNING id
    `).get(
      propertyId,
      subCategory,
      description || null,
      details ? JSON.stringify(details) : null
    );

    const faq = await db.prepare('SELECT * FROM faqs WHERE id = ?').get(result?.id);
    res.status(201).json(faq);
  } catch (error) {
    console.error('[FAQs] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/properties/:id/faqs/:faqId
 * Update an FAQ
 */
router.put('/:id/faqs/:faqId', async (req, res) => {
  try {
    const { id: propertyId, faqId } = req.params;
    const { subCategory, description, details } = req.body;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM faqs WHERE id = ? AND property_id = ?').get(faqId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    await db.prepare(`
      UPDATE faqs 
      SET sub_category_name = ?, description = ?, details_json = ?
      WHERE id = ?
    `).run(
      subCategory || existing.sub_category_name,
      description !== undefined ? description : existing.description,
      details ? JSON.stringify(details) : existing.details_json,
      faqId
    );

    const updated = await db.prepare('SELECT * FROM faqs WHERE id = ?').get(faqId);
    res.json({
      id: updated.id,
      propertyId: updated.property_id,
      subCategory: updated.sub_category_name,
      description: updated.description,
      details: updated.details_json ? JSON.parse(updated.details_json) : {},
      createdAt: updated.created_at,
    });
  } catch (error) {
    console.error('[FAQs] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/properties/:id/faqs/:faqId
 * Delete an FAQ
 */
router.delete('/:id/faqs/:faqId', async (req, res) => {
  try {
    const { id: propertyId, faqId } = req.params;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM faqs WHERE id = ? AND property_id = ?').get(faqId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'FAQ not found' });
    }

    await db.prepare('DELETE FROM faqs WHERE id = ?').run(faqId);
    res.json({ success: true, id: faqId });
  } catch (error) {
    console.error('[FAQs] Delete error:', error);
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
router.get('/:id/staff', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const staff = await db.prepare('SELECT * FROM staff WHERE property_id = ?').all(id);

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
router.post('/:id/staff', async (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { name, phone, role, preferredLanguage, details } = req.body;
    const db = getDb();

    if (!name || !phone) {
      return res.status(400).json({ error: 'Missing required fields: name, phone' });
    }

    const id = uuidv4();

    await db.prepare(`
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

    const staff = await db.prepare('SELECT * FROM staff WHERE id = ?').get(id);
    res.status(201).json(staff);
  } catch (error) {
    console.error('[Staff] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/properties/:id/staff/:staffId
 * Update a staff member
 */
router.put('/:id/staff/:staffId', async (req, res) => {
  try {
    const { id: propertyId, staffId } = req.params;
    const { name, phone, role, preferredLanguage, details } = req.body;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM staff WHERE id = ? AND property_id = ?').get(staffId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    await db.prepare(`
      UPDATE staff 
      SET name = ?, phone = ?, role = ?, preferred_language = ?, details_json = ?
      WHERE id = ?
    `).run(
      name || existing.name,
      phone || existing.phone,
      role || existing.role,
      preferredLanguage || existing.preferred_language,
      details ? JSON.stringify(details) : existing.details_json,
      staffId
    );

    const updated = await db.prepare('SELECT * FROM staff WHERE id = ?').get(staffId);
    res.json({
      id: updated.id,
      propertyId: updated.property_id,
      name: updated.name,
      phone: updated.phone,
      role: updated.role,
      preferredLanguage: updated.preferred_language,
      details: updated.details_json ? JSON.parse(updated.details_json) : {},
      createdAt: updated.created_at,
    });
  } catch (error) {
    console.error('[Staff] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/properties/:id/staff/:staffId
 * Delete a staff member
 */
router.delete('/:id/staff/:staffId', async (req, res) => {
  try {
    const { id: propertyId, staffId } = req.params;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM staff WHERE id = ? AND property_id = ?').get(staffId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    await db.prepare('DELETE FROM staff WHERE id = ?').run(staffId);
    res.json({ success: true, id: staffId });
  } catch (error) {
    console.error('[Staff] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TASK DEFINITIONS
// ============================================================================

/**
 * GET /api/properties/:id/task-definitions
 * Get task definitions for a property
 */
router.get('/:id/task-definitions', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const taskDefs = await db.prepare('SELECT * FROM task_definitions WHERE property_id = ? ORDER BY sub_category_name').all(id);

    res.json(taskDefs.map(t => ({
      id: t.id,
      propertyId: t.property_id,
      subCategory: t.sub_category_name,
      hostEscalation: t.host_escalation,
      staffRequirements: t.staff_requirements,
      guestRequirements: t.guest_requirements,
      staffId: t.staff_id,
      staffName: t.staff_name,
      staffPhone: t.staff_phone,
      details: t.details_json ? JSON.parse(t.details_json) : {},
      createdAt: t.created_at,
    })));
  } catch (error) {
    console.error('[TaskDefs] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/properties/:id/task-definitions
 * Create a task definition
 */
router.post('/:id/task-definitions', async (req, res) => {
  try {
    const { id: propertyId } = req.params;
    const { subCategory, description, hostEscalation, staffRequirements, guestRequirements, staffId, staffName, staffPhone, details } = req.body;
    const db = getDb();

    if (!subCategory) {
      return res.status(400).json({ error: 'Missing required field: subCategory' });
    }

    // Include description in details
    const detailsObj = {
      ...(details || {}),
      description: description || '',
      primaryCategory: req.body.primaryCategory || 'Other',
    };

    // Insert the task definition
    await db.prepare(`
      INSERT INTO task_definitions (property_id, sub_category_name, host_escalation, staff_requirements, guest_requirements, staff_id, staff_name, staff_phone, details_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      propertyId,
      subCategory,
      hostEscalation || null,
      staffRequirements || null,
      guestRequirements || null,
      staffId || null,
      staffName || null,
      staffPhone || null,
      JSON.stringify(detailsObj)
    );

    // Fetch the most recently inserted task definition for this property
    const taskDef = await db.prepare(
      'SELECT * FROM task_definitions WHERE property_id = ? AND sub_category_name = ? ORDER BY id DESC LIMIT 1'
    ).get(propertyId, subCategory);
    
    res.status(201).json(taskDef || { message: 'Task definition created' });
  } catch (error) {
    console.error('[TaskDefs] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/properties/:id/task-definitions/:taskDefId
 * Update a task definition
 */
router.put('/:id/task-definitions/:taskDefId', async (req, res) => {
  try {
    const { id: propertyId, taskDefId } = req.params;
    const { subCategory, description, primaryCategory, hostEscalation, staffRequirements, guestRequirements, staffId, staffName, staffPhone } = req.body;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM task_definitions WHERE id = ? AND property_id = ?').get(taskDefId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'Task definition not found' });
    }

    // Merge existing details with updates
    const existingDetails = existing.details_json ? JSON.parse(existing.details_json) : {};
    const detailsObj = {
      ...existingDetails,
      description: description !== undefined ? description : existingDetails.description,
      primaryCategory: primaryCategory || existingDetails.primaryCategory || 'Other',
    };

    await db.prepare(`
      UPDATE task_definitions 
      SET sub_category_name = ?, 
          host_escalation = ?, 
          staff_requirements = ?, 
          guest_requirements = ?,
          staff_id = ?,
          staff_name = ?,
          staff_phone = ?,
          details_json = ?
      WHERE id = ?
    `).run(
      subCategory || existing.sub_category_name,
      hostEscalation !== undefined ? hostEscalation : existing.host_escalation,
      staffRequirements !== undefined ? staffRequirements : existing.staff_requirements,
      guestRequirements !== undefined ? guestRequirements : existing.guest_requirements,
      staffId !== undefined ? staffId : existing.staff_id,
      staffName !== undefined ? staffName : existing.staff_name,
      staffPhone !== undefined ? staffPhone : existing.staff_phone,
      JSON.stringify(detailsObj),
      taskDefId
    );

    const updated = await db.prepare('SELECT * FROM task_definitions WHERE id = ?').get(taskDefId);
    res.json({
      id: updated.id,
      propertyId: updated.property_id,
      subCategory: updated.sub_category_name,
      hostEscalation: updated.host_escalation,
      staffRequirements: updated.staff_requirements,
      guestRequirements: updated.guest_requirements,
      staffId: updated.staff_id,
      staffName: updated.staff_name,
      staffPhone: updated.staff_phone,
      details: updated.details_json ? JSON.parse(updated.details_json) : {},
      createdAt: updated.created_at,
    });
  } catch (error) {
    console.error('[TaskDefs] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/properties/:id/task-definitions/:taskDefId
 * Delete a task definition
 */
router.delete('/:id/task-definitions/:taskDefId', async (req, res) => {
  try {
    const { id: propertyId, taskDefId } = req.params;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM task_definitions WHERE id = ? AND property_id = ?').get(taskDefId, propertyId);
    if (!existing) {
      return res.status(404).json({ error: 'Task definition not found' });
    }

    await db.prepare('DELETE FROM task_definitions WHERE id = ?').run(taskDefId);
    res.json({ success: true, id: taskDefId });
  } catch (error) {
    console.error('[TaskDefs] Delete error:', error);
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
    const existing = await db.prepare('SELECT id FROM properties WHERE id = ?').get(propertyId);
    
    if (existing) {
      // Update existing
      await db.prepare(`
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
      await db.prepare(`
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

    const existingBooking = await db.prepare('SELECT id FROM bookings WHERE property_id = ?').get(propertyId);
    if (!existingBooking) {
      await db.prepare(`
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

    // Create sample messages - use PostgreSQL timestamp syntax
    const existingMessages = await db.prepare('SELECT COUNT(*) as count FROM messages WHERE property_id = ?').get(propertyId);
    if (!existingMessages || existingMessages.count === 0 || existingMessages.count === '0') {
      const msgId1 = uuidv4();
      const msgId2 = uuidv4();

      await db.prepare(`
        INSERT INTO messages (id, property_id, booking_id, from_number, to_number, body, message_type, requestor_role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL '1 hour')
      `).run(msgId1, propertyId, bookingId, 'whatsapp:+31630211666', 'whatsapp:+14155238886', 
        'Hi! What is the WiFi password?', 'Inbound', 'Guest');

      await db.prepare(`
        INSERT INTO messages (id, property_id, booking_id, from_number, to_number, body, message_type, requestor_role, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW() - INTERVAL '30 minutes')
      `).run(msgId2, propertyId, bookingId, 'whatsapp:+14155238886', 'whatsapp:+31630211666',
        `The WiFi network is "${propertyData['Wifi Network Name'] || 'kaum_villa'}" and the password is "${propertyData['Wifi Password'] || 'balilestari'}". Enjoy your stay!`,
        'Outbound', 'Host');
    }

    // Create a sample task
    const existingTasks = await db.prepare('SELECT COUNT(*) as count FROM tasks WHERE property_id = ?').get(propertyId);
    if (!existingTasks || existingTasks.count === 0 || existingTasks.count === '0') {
      const taskId = uuidv4();
      await db.prepare(`
        INSERT INTO tasks (id, property_id, booking_id, phone, task_request_title, guest_message, task_bucket, action_holder, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(taskId, propertyId, bookingId, 'whatsapp:+31630211666',
        'Pool towels request', 'Can we get extra pool towels please?', 'Cleaning', 'Staff', 'Waiting on Staff');
    }

    // Add WiFi FAQ
    const existingFaq = await db.prepare('SELECT id FROM faqs WHERE property_id = ? AND sub_category_name = ?').get(propertyId, 'WiFi');
    if (!existingFaq) {
      await db.prepare(`
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
    const property = await db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    const bookings = await db.prepare('SELECT * FROM bookings WHERE property_id = ?').all(propertyId);
    const messages = await db.prepare('SELECT * FROM messages WHERE property_id = ?').all(propertyId);
    const tasks = await db.prepare('SELECT * FROM tasks WHERE property_id = ?').all(propertyId);
    const faqs = await db.prepare('SELECT * FROM faqs WHERE property_id = ?').all(propertyId);

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

/**
 * POST /api/properties/migrate-to-uuid
 * Migrate a property from custom ID to UUID and update all related tables
 */
router.post('/migrate-to-uuid', async (req, res) => {
  try {
    const db = getDb();
    const { oldId, newId } = req.body;

    if (!oldId || !newId) {
      return res.status(400).json({ error: 'Missing required fields: oldId, newId' });
    }

    console.log(`[Migration] Migrating property ${oldId} -> ${newId}`);

    // Check if old property exists
    const oldProperty = await db.prepare('SELECT * FROM properties WHERE id = ?').get(oldId);
    if (!oldProperty) {
      return res.status(404).json({ error: `Property ${oldId} not found` });
    }

    // Check if new ID already exists
    const existingNew = await db.prepare('SELECT id FROM properties WHERE id = ?').get(newId);
    if (existingNew) {
      return res.status(400).json({ error: `Property ${newId} already exists` });
    }

    // Create new property with UUID
    await db.prepare(`
      INSERT INTO properties (id, name, address, host_phone, host_name, details_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      newId,
      oldProperty.name,
      oldProperty.address,
      oldProperty.host_phone,
      oldProperty.host_name,
      oldProperty.details_json,
      oldProperty.created_at
    );

    // Update all related tables
    const updates = {};

    // Update bookings
    const bookingResult = await db.prepare('UPDATE bookings SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.bookings = bookingResult.changes || 0;

    // Update staff
    const staffResult = await db.prepare('UPDATE staff SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.staff = staffResult.changes || 0;

    // Update messages
    const messagesResult = await db.prepare('UPDATE messages SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.messages = messagesResult.changes || 0;

    // Update tasks
    const tasksResult = await db.prepare('UPDATE tasks SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.tasks = tasksResult.changes || 0;

    // Update faqs
    const faqsResult = await db.prepare('UPDATE faqs SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.faqs = faqsResult.changes || 0;

    // Update task_definitions
    const taskDefsResult = await db.prepare('UPDATE task_definitions SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.taskDefinitions = taskDefsResult.changes || 0;

    // Update ai_logs
    const aiLogsResult = await db.prepare('UPDATE ai_logs SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.aiLogs = aiLogsResult.changes || 0;

    // Update summarized_logs
    const sumLogsResult = await db.prepare('UPDATE summarized_logs SET property_id = ? WHERE property_id = ?').run(newId, oldId);
    updates.summarizedLogs = sumLogsResult.changes || 0;

    // Delete old property
    await db.prepare('DELETE FROM properties WHERE id = ?').run(oldId);

    console.log(`[Migration] Completed: ${JSON.stringify(updates)}`);

    // Return new property data
    const newProperty = await db.prepare('SELECT * FROM properties WHERE id = ?').get(newId);

    res.json({
      message: 'Property migrated successfully',
      oldId,
      newId,
      updates,
      property: newProperty
    });
  } catch (error) {
    console.error('[Migration] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

