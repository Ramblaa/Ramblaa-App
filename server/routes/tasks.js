/**
 * Tasks Routes
 * API endpoints for task management
 */

import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDbWithPrepare as getDb } from '../db/index.js';
import {
  getActiveTasks,
  getTaskById,
  updateTask,
  processTaskWorkflow,
  evaluateTaskStatus,
  archiveCompletedTasks,
} from '../services/taskManager.js';

const router = Router();

/**
 * GET /api/tasks
 * Get all tasks with optional filters
 */
router.get('/', async (req, res) => {
  try {
    const { propertyId, status, assignee, limit = 100 } = req.query;
    const db = getDb();

    let sql = `
      SELECT t.*, 
        p.name as property_name,
        b.guest_name
      FROM tasks t
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN bookings b ON t.booking_id = b.id
      WHERE 1=1
    `;
    const params = [];

    if (propertyId) {
      sql += ' AND t.property_id = ?';
      params.push(propertyId);
    }

    if (status) {
      if (status === 'upcoming') {
        sql += " AND t.status != 'Completed'";
      } else {
        sql += ' AND t.status = ?';
        params.push(status);
      }
    }

    if (assignee) {
      sql += ' AND t.staff_name LIKE ?';
      params.push(`%${assignee}%`);
    }

    sql += ' ORDER BY t.created_at DESC LIMIT ?';
    params.push(parseInt(limit, 10));

    const tasks = await db.prepare(sql).all(...params);

    // Format response
    const formatted = tasks.map(task => {
      // Handle date - PostgreSQL returns Date objects, not strings
      const createdAt = task.created_at ? new Date(task.created_at).toISOString() : null;
      return {
        id: task.id,
        title: task.task_request_title || task.action_title || task.task_bucket,
        type: getTaskType(task.task_bucket),
        property: task.property_name || 'Unknown',
        propertyId: task.property_id,
        assignee: task.staff_name || 'Unassigned',
        assigneePhone: task.staff_phone,
        dueDate: createdAt?.split('T')[0],
        dueTime: createdAt?.split('T')[1]?.slice(0, 5),
        status: formatStatus(task.status),
        priority: getPriority(task.urgency_indicators),
        description: task.guest_message || '',
        threadCount: 1, // Would need to count from messages
        actionHolder: task.action_holder,
        guestPhone: task.phone,
        guestName: task.guest_name,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error('[Tasks] List error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tasks/:id
 * Get task details
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const task = await db.prepare(`
      SELECT t.*, 
        p.name as property_name,
        b.guest_name
      FROM tasks t
      LEFT JOIN properties p ON t.property_id = p.id
      LEFT JOIN bookings b ON t.booking_id = b.id
      WHERE t.id = ?
    `).get(id);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Get related messages
    const messages = await db.prepare(`
      SELECT * FROM messages 
      WHERE reference_task_ids LIKE ?
      ORDER BY created_at ASC
    `).all(`%${id}%`);

    // Parse ongoing conversation
    let conversation = [];
    if (task.ongoing_conversation) {
      try {
        conversation = JSON.parse(task.ongoing_conversation);
      } catch (e) {
        conversation = task.ongoing_conversation.split('\n').filter(Boolean);
      }
    }

    res.json({
      id: task.id,
      title: task.task_request_title || task.action_title,
      type: getTaskType(task.task_bucket),
      bucket: task.task_bucket,
      property: task.property_name || 'Unknown',
      propertyId: task.property_id,
      assignee: task.staff_name || 'Unassigned',
      assigneePhone: task.staff_phone,
      status: formatStatus(task.status),
      priority: getPriority(task.urgency_indicators),
      description: task.guest_message,
      guestMessage: task.guest_message,
      guestPhone: task.phone,
      guestName: task.guest_name,
      actionHolder: task.action_holder,
      actionHolderPhone: task.action_holder_phone,
      missingRequirements: task.action_holder_missing_requirements,
      staffRequirements: task.staff_requirements,
      guestRequirements: task.guest_requirements,
      hostEscalation: task.host_escalation,
      aiResponse: task.ai_message_response,
      conversation,
      messages: messages.map(m => ({
        id: m.id,
        text: m.body,
        sender: m.message_type === 'Inbound' ? 'guest' : 'host',
        timestamp: m.created_at,
      })),
      createdAt: task.created_at,
      updatedAt: task.updated_at,
    });
  } catch (error) {
    console.error('[Tasks] Get error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks
 * Create a new task
 */
router.post('/', (req, res) => {
  try {
    const db = getDb();
    const {
      propertyId,
      bookingId,
      phone,
      title,
      description,
      taskBucket,
      staffId,
      staffName,
      staffPhone,
    } = req.body;

    if (!propertyId || !title) {
      return res.status(400).json({ error: 'Missing required fields: propertyId, title' });
    }

    const id = uuidv4();

    db.prepare(`
      INSERT INTO tasks (
        id, property_id, booking_id, phone, task_request_title,
        guest_message, task_bucket, staff_id, staff_name, staff_phone,
        action_holder, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Staff', 'Waiting on Staff', CURRENT_TIMESTAMP)
    `).run(
      id,
      propertyId,
      bookingId || null,
      phone || null,
      title,
      description || '',
      taskBucket || 'Other',
      staffId || null,
      staffName || null,
      staffPhone || null
    );

    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    res.status(201).json(task);
  } catch (error) {
    console.error('[Tasks] Create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/tasks/:id
 * Update task status or details
 */
router.patch('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = getDb();

    // Validate task exists
    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Map frontend status to backend status
    if (updates.status) {
      updates.status = mapStatus(updates.status);
    }

    const updated = updateTask(id, updates);
    res.json(updated);
  } catch (error) {
    console.error('[Tasks] Update error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    console.error('[Tasks] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/:id/complete
 * Mark task as completed
 */
router.post('/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    
    const updated = updateTask(id, { status: 'Completed' });
    res.json(updated);
  } catch (error) {
    console.error('[Tasks] Complete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/process
 * Trigger task workflow processing
 */
router.post('/process', async (req, res) => {
  try {
    const results = await processTaskWorkflow();
    res.json({ processed: results.length, results });
  } catch (error) {
    console.error('[Tasks] Process error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/evaluate
 * Evaluate task statuses
 */
router.post('/evaluate', async (req, res) => {
  try {
    const updates = await evaluateTaskStatus();
    res.json({ evaluated: updates.length, updates });
  } catch (error) {
    console.error('[Tasks] Evaluate error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/archive
 * Archive completed tasks
 */
router.post('/archive', async (req, res) => {
  try {
    const count = await archiveCompletedTasks();
    res.json({ archived: count });
  } catch (error) {
    console.error('[Tasks] Archive error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper functions

function getTaskType(bucket) {
  const lower = (bucket || '').toLowerCase();
  if (lower.includes('clean') || lower.includes('towel') || lower.includes('sheet')) return 'cleaning';
  if (lower.includes('repair') || lower.includes('fix') || lower.includes('maintenance')) return 'maintenance';
  if (lower.includes('inspect')) return 'inspection';
  if (lower.includes('restock') || lower.includes('supply')) return 'restocking';
  return 'other';
}

function formatStatus(status) {
  if (!status) return 'pending';
  const lower = status.toLowerCase();
  if (lower.includes('completed')) return 'completed';
  if (lower.includes('staff')) return 'in-progress';
  if (lower.includes('host')) return 'escalated';
  return 'pending';
}

function mapStatus(status) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'in-progress': return 'Waiting on Staff';
    case 'pending': return 'Waiting on Guest';
    case 'escalated': return 'Waiting on Host';
    default: return status;
  }
}

function getPriority(urgency) {
  if (!urgency) return 'low';
  const lower = urgency.toLowerCase();
  if (lower.includes('critical') || lower.includes('high')) return 'high';
  if (lower.includes('medium')) return 'medium';
  return 'low';
}

export default router;

