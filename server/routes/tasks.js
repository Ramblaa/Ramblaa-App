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

// ============================================================================
// UTILITY ROUTES - Must be defined BEFORE /:id to avoid matching
// ============================================================================

/**
 * GET /api/tasks/ai-logs
 * Check AI logs to debug task creation
 */
router.get('/ai-logs', async (req, res) => {
  try {
    const db = getDb();
    const logs = await db.prepare(`
      SELECT id, message, task_bucket, task_required, task_created, task_uuid,
             property_id, booking_id, to_number, recipient_type, created_at
      FROM ai_logs
      ORDER BY created_at DESC
      LIMIT 20
    `).all();
    
    res.json({
      count: logs.length,
      logs,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/force-create
 * Force task creation from pending AI logs
 */
router.post('/force-create', async (req, res) => {
  try {
    const { createTasksFromAiLogs } = await import('../services/taskManager.js');
    console.log('[Tasks] Force creating tasks from AI logs...');
    const created = await createTasksFromAiLogs();
    res.json({
      success: true,
      created: created.length,
      tasks: created.map(t => ({
        id: t.id,
        bucket: t.task_bucket,
        staff: t.staff_name,
        property: t.property_id,
      })),
    });
  } catch (error) {
    console.error('[Tasks] Force create error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/migrate-dates
 * Add scheduled_at and completed_at columns to tasks table
 */
router.post('/migrate-dates', async (req, res) => {
  try {
    const db = getDb();
    
    // Add scheduled_at column if not exists
    try {
      await db.prepare(`ALTER TABLE tasks ADD COLUMN scheduled_at TIMESTAMP`).run();
      console.log('[Tasks] Added scheduled_at column');
    } catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes('duplicate column')) {
        console.log('[Tasks] scheduled_at column may already exist:', e.message);
      }
    }
    
    // Add completed_at column if not exists
    try {
      await db.prepare(`ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP`).run();
      console.log('[Tasks] Added completed_at column');
    } catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes('duplicate column')) {
        console.log('[Tasks] completed_at column may already exist:', e.message);
      }
    }
    
    // Add task_action column to messages if not exists
    try {
      await db.prepare(`ALTER TABLE messages ADD COLUMN task_action TEXT`).run();
      console.log('[Tasks] Added task_action column to messages');
    } catch (e) {
      if (!e.message.includes('already exists') && !e.message.includes('duplicate column')) {
        console.log('[Tasks] task_action column may already exist:', e.message);
      }
    }
    
    res.json({ success: true, message: 'All migrations complete' });
  } catch (error) {
    console.error('[Tasks] Migration error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/cleanup
 * Clean up old broken tasks from previous buggy runs
 */
router.post('/cleanup', async (req, res) => {
  try {
    const db = getDb();
    
    // First, get the tasks that will be deleted
    const toDelete = await db.prepare(`
      SELECT id, action_title, task_bucket, status, created_at
      FROM tasks
      WHERE action_title ILIKE ANY(ARRAY['%Wi-Fi%', '%WiFi%', '%wifi%', '%direction%', '%taxi%'])
         OR task_bucket ILIKE ANY(ARRAY['%Wi-Fi%', '%WiFi%', '%wifi%', '%direction%', '%taxi%', 'Other'])
    `).all();
    
    console.log(`[Tasks] Found ${toDelete.length} broken tasks to clean up`);
    
    // Delete the broken tasks
    await db.prepare(`
      DELETE FROM tasks
      WHERE action_title ILIKE ANY(ARRAY['%Wi-Fi%', '%WiFi%', '%wifi%', '%direction%', '%taxi%'])
         OR task_bucket ILIKE ANY(ARRAY['%Wi-Fi%', '%WiFi%', '%wifi%', '%direction%', '%taxi%', 'Other'])
    `).run();
    
    // Also clean up related ai_logs entries
    await db.prepare(`
      UPDATE ai_logs 
      SET task_created = 0, task_uuid = NULL
      WHERE task_bucket ILIKE ANY(ARRAY['%Wi-Fi%', '%WiFi%', '%wifi%', '%direction%', '%taxi%', 'Other'])
    `).run();
    
    console.log(`[Tasks] Cleaned up ${toDelete.length} broken tasks`);
    
    res.json({
      success: true,
      deletedCount: toDelete.length,
      deletedTasks: toDelete,
    });
  } catch (error) {
    console.error('[Tasks] Cleanup error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tasks/cancel-all
 * Cancel all incomplete tasks (for fresh start)
 */
router.post('/cancel-all', async (req, res) => {
  try {
    const db = getDb();
    
    // Get tasks that will be cancelled
    const toCancel = await db.prepare(`
      SELECT id, action_title, status FROM tasks WHERE status != 'Completed'
    `).all();
    
    // Mark all incomplete tasks as cancelled
    await db.prepare(`
      UPDATE tasks SET status = 'Cancelled', action_holder_notified = 1, completion_notified = 1
      WHERE status != 'Completed'
    `).run();
    
    console.log(`[Tasks] Cancelled ${toCancel.length} tasks`);
    
    res.json({
      success: true,
      cancelledCount: toCancel.length,
      cancelledTasks: toCancel,
    });
  } catch (error) {
    console.error('[Tasks] Cancel-all error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// TASK DETAIL ROUTES - /:id must be LAST
// ============================================================================

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
      scheduledAt: task.scheduled_at,
      completedAt: task.completed_at,
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
router.post('/', async (req, res) => {
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

    await db.prepare(`
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

    const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
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
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    const db = getDb();

    // Validate task exists
    const existing = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Map frontend status to backend status
    if (updates.status) {
      updates.status = mapStatus(updates.status);
    }

    const updated = await updateTask(id, updates);
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
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDb();

    const existing = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Task not found' });
    }

    await db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
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
    
    const updated = await updateTask(id, { status: 'Completed' });
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
  if (lower.includes('scheduled')) return 'scheduled';
  if (lower.includes('in progress') || lower.includes('in-progress')) return 'in-progress';
  if (lower.includes('staff')) return 'in-progress';
  if (lower.includes('escalated') || lower.includes('host')) return 'escalated';
  if (lower.includes('waiting')) return 'pending';
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

/**
 * GET /api/tasks/debug-logs
 * Get debug AI logs for auditing
 */
router.get('/debug-logs', async (req, res) => {
  try {
    const db = getDb();
    const { limit = 50, phase, function_name } = req.query;
    
    let sql = `
      SELECT id, function_name, phase, prompt_label, 
             SUBSTRING(prompt, 1, 500) as prompt_preview,
             SUBSTRING(response, 1, 500) as response_preview,
             parsed_json, task_scope, thread_info, created_at
      FROM debug_ai_logs
      WHERE 1=1
    `;
    const params = [];
    
    if (phase) {
      sql += ` AND phase = $${params.length + 1}`;
      params.push(phase);
    }
    if (function_name) {
      sql += ` AND function_name = $${params.length + 1}`;
      params.push(function_name);
    }
    
    sql += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(parseInt(limit, 10));
    
    const logs = await db.prepare(sql).all(...params);
    
    res.json({
      count: logs.length,
      logs: logs.map(log => ({
        ...log,
        parsed_json: log.parsed_json ? safeJsonParse(log.parsed_json) : null,
        thread_info: log.thread_info ? safeJsonParse(log.thread_info) : null,
      })),
    });
  } catch (error) {
    console.error('[Tasks] Debug logs error:', error);
    res.status(500).json({ error: 'Failed to fetch debug logs' });
  }
});

/**
 * GET /api/tasks/debug-logs/:id
 * Get full debug log entry
 */
router.get('/debug-logs/:id', async (req, res) => {
  try {
    const db = getDb();
    const { id } = req.params;
    
    const log = await db.prepare(`
      SELECT * FROM debug_ai_logs WHERE id = $1
    `).get(id);
    
    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }
    
    res.json({
      ...log,
      parsed_json: log.parsed_json ? safeJsonParse(log.parsed_json) : null,
      thread_info: log.thread_info ? safeJsonParse(log.thread_info) : null,
    });
  } catch (error) {
    console.error('[Tasks] Debug log detail error:', error);
    res.status(500).json({ error: 'Failed to fetch debug log' });
  }
});

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * GET /api/tasks/diagnostics
 * Diagnostic endpoint to verify data flow
 */
router.get('/diagnostics', async (req, res) => {
  try {
    const db = getDb();
    
    // Get recent messages
    const recentMessages = await db.prepare(`
      SELECT id, from_number, body, booking_id, property_id, requestor_role, created_at
      FROM messages
      ORDER BY created_at DESC
      LIMIT 5
    `).all();
    
    // Get recent AI logs
    const recentAiLogs = await db.prepare(`
      SELECT id, message, task_required, task_bucket, task_created, property_id, booking_id, created_at
      FROM ai_logs
      ORDER BY created_at DESC
      LIMIT 5
    `).all();
    
    // Get recent tasks
    const recentTasks = await db.prepare(`
      SELECT id, task_bucket, staff_name, staff_phone, property_id, status, created_at
      FROM tasks
      ORDER BY created_at DESC
      LIMIT 5
    `).all();
    
    // Get task definitions
    const taskDefs = await db.prepare(`
      SELECT property_id, sub_category_name, staff_name, staff_phone
      FROM task_definitions
      LIMIT 20
    `).all();
    
    // Get debug logs
    const debugLogs = await db.prepare(`
      SELECT id, function_name, phase, 
             SUBSTRING(prompt, 1, 300) as prompt_start,
             SUBSTRING(response, 1, 300) as response_start,
             created_at
      FROM debug_ai_logs
      ORDER BY created_at DESC
      LIMIT 5
    `).all();
    
    res.json({
      timestamp: new Date().toISOString(),
      version: '2024-12-04-v4',
      recentMessages: recentMessages.map(m => ({
        ...m,
        body: m.body?.substring(0, 100),
      })),
      recentAiLogs,
      recentTasks,
      taskDefinitions: taskDefs,
      debugLogs,
    });
  } catch (error) {
    console.error('[Tasks] Diagnostics error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

