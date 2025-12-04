/**
 * Task Manager Service - Ported from guestResponse.gs
 * Handles task creation, workflow, and completion
 * 
 * UUID TRACKING: Tasks link to message_chain_ids for full audit trail
 */

import { v4 as uuidv4 } from 'uuid';
import { getDbWithPrepare as getDb } from '../db/index.js';
import { chatJSON, callGPTTurbo, detectLanguage } from './openai.js';
import { sendWhatsAppMessage } from './twilio.js';
import { fillTemplate } from '../utils/templateFiller.js';
import {
  PROMPT_TASK_TRIAGE,
  PROMPT_GUEST_REQUIREMENTS_EVAL,
  PROMPT_GUEST_INFO_REQUEST,
  PROMPT_STAFF_INFO_REQUEST,
  PROMPT_HOST_ESCALATION,
  PROMPT_GUEST_TASK_COMPLETED,
  PROMPT_TASK_BOOLEAN_EVAL_SYSTEM,
  PROMPT_TASK_BOOLEAN_EVAL_USER,
} from '../prompts/index.js';

/**
 * Create tasks from AI logs where task is required
 * Equivalent to createStaffTasks() from guestResponse.gs
 */
export async function createTasksFromAiLogs() {
  const db = getDb();
  const created = [];

  // Get AI logs that need task creation (INTEGER columns: 1=true, 0=false)
  const logs = await db.prepare(`
    SELECT * FROM ai_logs 
    WHERE task_required = 1 AND task_created = 0 AND recipient_type = 'Guest'
    ORDER BY created_at ASC
  `).all();

  if (!logs || !logs.length) {
    console.log('[TaskManager] No AI logs requiring task creation');
    return created;
  }

  console.log(`[TaskManager] Processing ${logs.length} AI logs for task creation`);

  for (const log of logs) {
    console.log(`[TaskManager] ========================================`);
    console.log(`[TaskManager] Processing AI log: ${log.id}`);
    console.log(`[TaskManager]   task_bucket: "${log.task_bucket}"`);
    console.log(`[TaskManager]   property_id: ${log.property_id}`);
    console.log(`[TaskManager]   booking_id: ${log.booking_id}`);
    console.log(`[TaskManager]   to_number: ${log.to_number}`);
    console.log(`[TaskManager] ========================================`);
    
    if (!log.task_bucket) {
      console.log(`[TaskManager] ✗ Skipping - no task bucket`);
      continue;
    }
    
    // Skip invalid buckets (hallucinated tasks)
    const lowerBucket = log.task_bucket.toLowerCase();
    if (lowerBucket.includes('wifi') || lowerBucket.includes('wi-fi') || 
        lowerBucket.includes('direction') || lowerBucket.includes('taxi') ||
        log.task_bucket === 'Other') {
      console.log(`[TaskManager] ✗ Skipping invalid bucket: "${log.task_bucket}"`);
      await db.prepare(`UPDATE ai_logs SET task_created = 1 WHERE id = ?`).run(log.id);
      continue;
    }
    
    // Try to find property_id if missing
    let propertyId = log.property_id;
    if (!propertyId && log.booking_id) {
      const booking = await db.prepare(`SELECT property_id FROM bookings WHERE id = ?`).get(log.booking_id);
      if (booking) {
        propertyId = booking.property_id;
        console.log(`[TaskManager] Found property from booking: ${propertyId}`);
      }
    }
    
    if (!propertyId) {
      console.log(`[TaskManager] ✗ Skipping - no property_id (cannot find task definition)`);
      continue;
    }

    // Check for existing open task with same bucket
    const existing = await db.prepare(`
      SELECT id FROM tasks 
      WHERE phone = ? AND property_id = ? AND task_bucket = ? AND status != 'Completed'
      LIMIT 1
    `).get(log.to_number, propertyId, log.task_bucket);

    if (existing) {
      // Update the existing task reference
      console.log(`[TaskManager] Linking to existing task ${existing.id}`);
      await db.prepare(`UPDATE ai_logs SET task_created = 1, task_uuid = ? WHERE id = ?`)
        .run(existing.id, log.id);
      continue;
    }

    // Get task definition to find assigned staff using FLEXIBLE matching
    // Try multiple strategies: exact match -> contains match -> keyword match
    let taskDef = null;
    const bucket = log.task_bucket || '';
    
    console.log(`[TaskManager] Looking for task definition: property=${propertyId}, bucket="${bucket}"`);
    
    // Strategy 1: Exact match
    taskDef = await db.prepare(`
      SELECT * FROM task_definitions 
      WHERE property_id = ? AND LOWER(sub_category_name) = LOWER(?)
      LIMIT 1
    `).get(propertyId, bucket);
    
    if (!taskDef && bucket) {
      // Strategy 2: Task definition name contained in bucket (e.g., "Fresh Towels" in "Fresh Towels request")
      taskDef = await db.prepare(`
        SELECT * FROM task_definitions 
        WHERE property_id = ? AND LOWER(?) LIKE '%' || LOWER(sub_category_name) || '%'
        LIMIT 1
      `).get(propertyId, bucket);
    }
    
    if (!taskDef && bucket) {
      // Strategy 3: Bucket contained in task definition name
      taskDef = await db.prepare(`
        SELECT * FROM task_definitions 
        WHERE property_id = ? AND LOWER(sub_category_name) LIKE '%' || LOWER(?) || '%'
        LIMIT 1
      `).get(propertyId, bucket);
    }
    
    if (!taskDef && bucket) {
      // Strategy 4: First word match (e.g., "Fresh" matches "Fresh Towels")
      const firstWord = bucket.split(/\s+/)[0];
      if (firstWord && firstWord.length > 3) {
        taskDef = await db.prepare(`
          SELECT * FROM task_definitions 
          WHERE property_id = ? AND LOWER(sub_category_name) LIKE LOWER(?) || '%'
          LIMIT 1
        `).get(propertyId, firstWord);
      }
    }

    if (taskDef) {
      console.log(`[TaskManager] ✓ Found task definition: "${taskDef.sub_category_name}" for bucket "${bucket}"`);
      console.log(`[TaskManager]   Staff: ${taskDef.staff_name} (${taskDef.staff_phone})`);
    } else {
      console.log(`[TaskManager] ✗ No task definition found for bucket: "${bucket}" in property ${propertyId}`);
      // List available task definitions for debugging
      const available = await db.prepare(`
        SELECT sub_category_name FROM task_definitions WHERE property_id = ?
      `).all(propertyId);
      console.log(`[TaskManager]   Available definitions:`, available?.map(t => t.sub_category_name) || 'none');
    }

    // Create new task with UUID
    const taskId = uuidv4();
    const task = {
      id: taskId,
      property_id: propertyId,
      booking_id: log.booking_id,
      phone: log.to_number,
      guest_message: log.message || log.original_message,
      action_title: log.message || log.original_message,
      task_bucket: log.task_bucket,
      sub_category: log.task_bucket,
      task_request_title: log.task_request_title || log.message || '',
      task_json: taskDef?.details_json || '',
      staff_id: taskDef?.staff_id || null,
      staff_name: taskDef?.staff_name || null,
      staff_phone: taskDef?.staff_phone || null,
      staff_requirements: taskDef?.staff_requirements || '',
      guest_requirements: taskDef?.guest_requirements || '',
      host_escalation: taskDef?.host_escalation || '',
      action_holder: taskDef?.guest_requirements ? 'Guest' : 'Staff',
      action_holder_phone: taskDef?.guest_requirements ? log.to_number : (taskDef?.staff_phone || null),
      status: taskDef?.guest_requirements ? 'Waiting on Guest' : 'Waiting on Staff',
      message_chain_ids: log.message_bundle_uuid || log.id,  // Link to original message UUID
    };

    console.log(`[TaskManager] Creating task ${taskId} for bucket: ${task.task_bucket}`);

    await db.prepare(`
      INSERT INTO tasks (
        id, property_id, booking_id, phone, guest_message, action_title,
        task_bucket, sub_category, task_request_title, task_json,
        staff_id, staff_name, staff_phone, staff_requirements, guest_requirements,
        host_escalation, action_holder, action_holder_phone, status, message_chain_ids
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      task.id, task.property_id, task.booking_id, task.phone,
      task.guest_message, task.action_title, task.task_bucket, task.sub_category,
      task.task_request_title, task.task_json, task.staff_id, task.staff_name,
      task.staff_phone, task.staff_requirements, task.guest_requirements,
      task.host_escalation, task.action_holder, task.action_holder_phone,
      task.status, task.message_chain_ids
    );

    // Update AI log with task reference (INTEGER: 1=true)
    await db.prepare(`UPDATE ai_logs SET task_created = 1, task_uuid = ? WHERE id = ?`)
      .run(taskId, log.id);

    console.log(`[TaskManager] Task ${taskId} created, assigned to: ${task.staff_name || 'unassigned'}`);
    created.push(task);
  }

  return created;
}

/**
 * Process task workflow - triage and send messages
 * Equivalent to buildNextTaskMessage() from guestResponse.gs
 */
export async function processTaskWorkflow() {
  const db = getDb();
  const results = [];

  // Get active tasks that need processing (INTEGER: 0=false, 1=true)
  // IMPORTANT: Skip tasks that have already notified their action holder
  // ALSO: Skip broken/hallucinated tasks (wifi, directions, taxi, Other bucket)
  const tasks = await db.prepare(`
    SELECT * FROM tasks 
    WHERE status != 'Completed' 
    AND status != 'Cancelled'
    AND (completion_notified = 0 OR completion_notified IS NULL)
    AND (action_holder_notified = 0 OR action_holder_notified IS NULL)
    AND task_bucket IS NOT NULL
    AND task_bucket != ''
    AND task_bucket != 'Other'
    AND LOWER(task_bucket) NOT LIKE '%wifi%'
    AND LOWER(task_bucket) NOT LIKE '%wi-fi%'
    AND LOWER(task_bucket) NOT LIKE '%direction%'
    AND LOWER(task_bucket) NOT LIKE '%taxi%'
    ORDER BY created_at ASC
  `).all();

  if (!tasks || !tasks.length) {
    console.log('[TaskManager] No valid tasks to process');
    return results;
  }

  console.log(`[TaskManager] Processing ${tasks.length} valid tasks`);

  for (const task of tasks) {
    // Double-check task has required data
    if (!task.property_id) {
      console.log(`[TaskManager] Skipping task ${task.id} - no property_id`);
      continue;
    }
    if (!task.staff_phone && task.action_holder === 'Staff') {
      console.log(`[TaskManager] Skipping task ${task.id} - no staff phone for Staff action holder`);
      continue;
    }
    
    const result = await processTask(task);
    if (result) results.push(result);
  }

  return results;
}

/**
 * Process a single task through triage
 */
async function processTask(task) {
  const db = getDb();

  console.log(`[TaskManager] Processing task ${task.id}, status: ${task.status}`);

  // Check if task is completed
  if (task.status === 'Completed') {
    // Send completion notification if not already sent
    if (!task.completion_notified) {
      await sendCompletionNotification(task);
      await db.prepare(`UPDATE tasks SET completion_notified = 1 WHERE id = ?`).run(task.id);
    }
    return { task, action: 'completed' };
  }

  // Check if already notified (prevent duplicate notifications)
  if (task.action_holder_notified === 1) {
    console.log(`[TaskManager] Task ${task.id} already notified, skipping`);
    return { task, action: 'already_notified' };
  }

  // Check if we're waiting for a response
  const hasKickoff = task.ai_message_response && task.ai_message_response.length > 0;
  const responseReceived = task.response_received === 1 || task.response_received === true;

  if (hasKickoff && !responseReceived) {
    // Still waiting for response, skip
    console.log(`[TaskManager] Task ${task.id} waiting for response`);
    return { task, action: 'waiting' };
  }

  // Run triage
  const lang = await detectLanguage(task.guest_message || task.ongoing_conversation || '');
  
  // Run triage prompt to check if host escalation is needed
  const triageResult = await runTriage(task);

  // Determine action holder - STAFF FIRST for most tasks
  // Guest requirements are preferences, not blockers for staff notification
  let actionHolder = 'Staff';
  
  if (triageResult.hostNeeded) {
    // Only go to Host if escalation is truly needed
    actionHolder = 'Host';
  }
  // Note: Guest requirements (like "preferred time") are collected AFTER staff is notified
  // Staff can handle the task and coordinate timing with guest

  console.log(`[TaskManager] Task ${task.id} action holder: ${actionHolder}`);

  // Handle based on action holder
  let result = { task, action: actionHolder.toLowerCase() };

  if (actionHolder === 'Host') {
    await handleHostPath(task, triageResult, lang);
    await db.prepare(`UPDATE tasks SET action_holder = 'Host', status = 'Waiting on Host' WHERE id = ?`)
      .run(task.id);
  } else {
    // Default: Notify staff immediately
    await handleStaffPath(task, triageResult, lang);
    await db.prepare(`UPDATE tasks SET action_holder = 'Staff', status = 'Waiting on Staff' WHERE id = ?`)
      .run(task.id);
  }

  return result;
}

/**
 * Evaluate guest requirements from conversation thread
 */
async function evaluateGuestRequirements(requirements, thread) {
  const prompt = fillTemplate(PROMPT_GUEST_REQUIREMENTS_EVAL, {
    GUEST_REQUIREMENTS: requirements || '(none)',
    THREAD: thread || '[]',
  });

  const result = await chatJSON(prompt);

  if (result.error || !result.json) {
    return { satisfiedAll: false, missingItems: [], providedItems: [] };
  }

  return {
    satisfiedAll: result.json.satisfied_all === true,
    missingItems: Array.isArray(result.json.missing_items) ? result.json.missing_items : [],
    providedItems: Array.isArray(result.json.provided_items) ? result.json.provided_items : [],
  };
}

/**
 * Run triage prompt
 */
async function runTriage(task) {
  const prompt = fillTemplate(PROMPT_TASK_TRIAGE, {
    TASK_SCOPE: task.task_bucket || task.sub_category || 'Task',
    HOST_ESCALATION_CRITERIA: task.host_escalation || '',
    GUEST_REQUIREMENTS: task.guest_requirements || '',
    STAFF_REQUIREMENTS: task.staff_requirements || '',
    STAFF_CONVERSATION: task.ongoing_conversation || '',
    GUEST_MESSAGE: task.guest_message || '',
  });

  const result = await chatJSON(prompt);

  if (result.error || !result.json) {
    return { hostNeeded: false, actionHolder: 'Staff' };
  }

  return {
    hostNeeded: result.json.hostNeeded || result.json.host_escalation_needed || false,
    hostReason: result.json.hostReason || result.json.host_reason || '',
    guestMissing: result.json.guestMissing || [],
    staffMissing: result.json.staffMissing || [],
    actionHolder: result.json.actionHolder || result.json.action_holder || 'Staff',
  };
}

/**
 * Handle Host escalation path
 */
async function handleHostPath(task, triageResult, lang) {
  const db = getDb();

  // Get host phone
  let hostPhone = '';
  if (task.property_id) {
    const property = await db.prepare('SELECT host_phone FROM properties WHERE id = ?').get(task.property_id);
    hostPhone = property?.host_phone || '';
  }

  if (!hostPhone) {
    console.log(`[TaskManager] No host phone for task ${task.id}`);
    return;
  }

  // Generate host message
  const prompt = fillTemplate(PROMPT_HOST_ESCALATION, {
    LANG: lang,
    TASK_SCOPE: task.task_bucket || 'Task',
    HOST_ESCALATION_REQUIREMENTS: task.host_escalation || '',
    STAFF_REQUIREMENTS: task.staff_requirements || '',
    GUEST_REQUIREMENTS: task.guest_requirements || '',
    GUEST_MESSAGE: task.guest_message || '',
    THREAD_CONTEXT: task.ongoing_conversation || '',
    BOOKING_DETAILS_JSON: '',
    PROPERTY_DETAILS_JSON: '',
  });

  let message = await callGPTTurbo([{ role: 'user', content: prompt }]);
  if (!message) return;

  // Ensure Host: prefix
  if (!/^Host:/i.test(message)) {
    message = 'Host: ' + message;
  }

  console.log(`[TaskManager] Sending host escalation for task ${task.id}`);

  // Send message
  await sendWhatsAppMessage({
    to: hostPhone,
    body: message,
    recipientType: 'Host',
    metadata: {
      propertyId: task.property_id,
      taskId: task.id,
    },
  });

  // Update task (INTEGER: 1=true)
  await db.prepare(`
    UPDATE tasks SET 
      ai_message_response = ?, 
      action_holder_phone = ?,
      action_holder_notified = 1,
      host_notified = 1,
      host_escalation_needed = 1
    WHERE id = ?
  `).run(message, hostPhone, task.id);
}

/**
 * Handle Guest info request path
 */
async function handleGuestPath(task, missingItems, lang) {
  const db = getDb();

  const prompt = fillTemplate(PROMPT_GUEST_INFO_REQUEST, {
    LANG: lang,
    TASK_SCOPE: task.task_bucket || 'Task',
    GUEST_REQUIREMENTS: missingItems.join('; ') || task.guest_requirements || '',
    THREAD_CONTEXT: task.ongoing_conversation || '',
  });

  const message = await callGPTTurbo([{ role: 'user', content: prompt }]);
  if (!message) return;

  console.log(`[TaskManager] Requesting info from guest for task ${task.id}`);

  // Send message
  await sendWhatsAppMessage({
    to: task.phone,
    body: message,
    recipientType: 'Guest',
    metadata: {
      propertyId: task.property_id,
      taskId: task.id,
    },
  });

  // Update task (INTEGER: 1=true)
  await db.prepare(`
    UPDATE tasks SET 
      ai_message_response = ?, 
      action_holder_phone = ?,
      action_holder_notified = 1,
      action_holder_missing_requirements = ?
    WHERE id = ?
  `).run(message, task.phone, missingItems.join('; '), task.id);
}

/**
 * Handle Staff info request path
 */
async function handleStaffPath(task, triageResult, lang) {
  const db = getDb();

  if (!task.staff_phone) {
    console.log(`[TaskManager] No staff phone for task ${task.id}`);
    return;
  }

  const staffName = task.staff_name?.split(' ')[0] || 'there';

  const prompt = fillTemplate(PROMPT_STAFF_INFO_REQUEST, {
    STAFF_LANG: lang,
    STAFF_NAME: staffName,
    TASK_SCOPE: task.task_bucket || 'Task',
    STAFF_REQUIREMENTS: task.staff_requirements || '(none)',
    GUEST_CONTEXT: task.guest_message || '',
    THREAD_CONTEXT: task.ongoing_conversation || '',
    LATEST_STAFF_INBOUND: '',
    BOOKING_DETAILS_JSON: '',
    PROPERTY_DETAILS_JSON: '',
  });

  let message = await callGPTTurbo([{ role: 'user', content: prompt }]);
  if (!message) return;

  // Ensure Staff: prefix with greeting
  if (!/^Staff:/i.test(message)) {
    message = `Staff: Hi ${staffName} — ${message}`;
  }

  console.log(`[TaskManager] Notifying staff ${task.staff_name} for task ${task.id}`);

  // Send message
  await sendWhatsAppMessage({
    to: task.staff_phone,
    body: message,
    recipientType: 'Staff',
    metadata: {
      propertyId: task.property_id,
      taskId: task.id,
    },
  });

  // Update task (INTEGER: 1=true)
  await db.prepare(`
    UPDATE tasks SET 
      ai_message_response = ?, 
      action_holder_phone = ?,
      action_holder_notified = 1,
      action_holder_missing_requirements = ?
    WHERE id = ?
  `).run(message, task.staff_phone, task.staff_requirements || '', task.id);
}

/**
 * Send task completion notification to guest
 */
async function sendCompletionNotification(task) {
  const lang = await detectLanguage(task.guest_message || '');

  const prompt = fillTemplate(PROMPT_GUEST_TASK_COMPLETED, {
    LANG: lang,
    TASK_SCOPE: task.task_bucket || 'Task',
    GUEST_MESSAGE: task.guest_message || '',
    THREAD_CONTEXT: task.ongoing_conversation || '',
    TASK_JSON: task.task_json || '',
  });

  const message = await callGPTTurbo([{ role: 'user', content: prompt }]);
  if (!message) return;

  console.log(`[TaskManager] Sending completion notification for task ${task.id}`);

  await sendWhatsAppMessage({
    to: task.phone,
    body: message,
    recipientType: 'Guest',
    metadata: {
      propertyId: task.property_id,
      taskId: task.id,
    },
  });
}

/**
 * Evaluate if task requirements are met
 * Equivalent to evaluateTaskStatus() from guestResponse.gs
 */
export async function evaluateTaskStatus() {
  const db = getDb();
  const updates = [];

  const tasks = await db.prepare(`
    SELECT * FROM tasks 
    WHERE status != 'Completed' AND response_received = 1
  `).all();

  if (!tasks || !tasks.length) return updates;

  for (const task of tasks) {
    if (!task.staff_requirements || !task.ongoing_conversation) continue;

    const systemPrompt = PROMPT_TASK_BOOLEAN_EVAL_SYSTEM;
    const userPrompt = fillTemplate(PROMPT_TASK_BOOLEAN_EVAL_USER, {
      REQUIREMENTS: task.staff_requirements,
      STAFF_MESSAGE: task.ongoing_conversation,
    });

    try {
      const response = await callGPTTurbo([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ]);

      const isComplete = response.trim().toUpperCase() === 'TRUE';

      if (isComplete) {
        await db.prepare(`UPDATE tasks SET status = 'Completed' WHERE id = ?`).run(task.id);
        updates.push({ taskId: task.id, status: 'Completed' });
        console.log(`[TaskManager] Task ${task.id} marked as completed`);
      }
    } catch (error) {
      console.error(`[TaskManager] Eval error for task ${task.id}:`, error.message);
    }
  }

  return updates;
}

/**
 * Archive completed tasks
 * Equivalent to archiveCompletedTasks() from guestResponse.gs
 */
export async function archiveCompletedTasks() {
  const db = getDb();

  const completed = await db.prepare(`
    SELECT * FROM tasks WHERE status = 'Completed'
  `).all();

  if (!completed || !completed.length) return 0;

  for (const task of completed) {
    // Insert into archive (d_task_logs table)
    await db.prepare(`
      INSERT INTO d_task_logs (
        id, task_uuid, created_date, phone, property_id, booking_id, 
        guest_message, action_title, task_bucket, sub_category, task_json, 
        staff_id, staff_name, status, archived_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      uuidv4(),
      task.id,
      task.created_at,
      task.phone,
      task.property_id,
      task.booking_id,
      task.guest_message,
      task.action_title,
      task.task_bucket,
      task.sub_category,
      task.task_json,
      task.staff_id,
      task.staff_name,
      task.status
    );

    // Delete from active tasks
    await db.prepare(`DELETE FROM tasks WHERE id = ?`).run(task.id);
    console.log(`[TaskManager] Archived task ${task.id}`);
  }

  return completed.length;
}

/**
 * Get all active tasks
 */
export async function getActiveTasks(filters = {}) {
  const db = getDb();
  
  let sql = 'SELECT * FROM tasks WHERE 1=1';
  const params = [];

  if (filters.propertyId) {
    sql += ' AND property_id = ?';
    params.push(filters.propertyId);
  }

  if (filters.status) {
    sql += ' AND status = ?';
    params.push(filters.status);
  }

  sql += ' ORDER BY created_at DESC';

  return await db.prepare(sql).all(...params);
}

/**
 * Get task by ID
 */
export async function getTaskById(taskId) {
  const db = getDb();
  return await db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
}

/**
 * Update task
 */
export async function updateTask(taskId, updates) {
  const db = getDb();
  
  const fields = Object.keys(updates);
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const sql = `UPDATE tasks SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  
  await db.prepare(sql).run(...Object.values(updates), taskId);
  return await getTaskById(taskId);
}

/**
 * Process Staff/Host response message
 * Finds active tasks for this responder and updates them based on their reply
 */
export async function processStaffHostResponse({ messageId, from, body, role, propertyId, staffId }) {
  const db = getDb();
  const results = [];

  console.log(`[TaskManager] Processing ${role} response from ${from}: "${body.substring(0, 50)}..."`);

  // Find active tasks for this staff member or property
  let tasks = [];
  
  if (role === 'Staff' && staffId) {
    // Find tasks assigned to this staff member
    tasks = await db.prepare(`
      SELECT * FROM tasks 
      WHERE staff_id = ? AND status NOT IN ('Completed', 'Archived', 'Cancelled')
      ORDER BY created_at DESC
    `).all(staffId);
  } else if (role === 'Host' && propertyId) {
    // Find tasks escalated to host for this property
    tasks = await db.prepare(`
      SELECT * FROM tasks 
      WHERE property_id = ? AND status = 'Waiting on Host'
      ORDER BY created_at DESC
    `).all(propertyId);
  }

  if (!tasks.length) {
    // No active tasks - just log it
    console.log(`[TaskManager] No active tasks found for ${role} ${from}`);
    
    // Try to find most recent task for this property/staff
    const recentTask = await db.prepare(`
      SELECT * FROM tasks 
      WHERE (staff_id = ? OR property_id = ?) AND status != 'Archived'
      ORDER BY created_at DESC LIMIT 1
    `).get(staffId || '', propertyId || '');
    
    if (recentTask) {
      tasks = [recentTask];
      console.log(`[TaskManager] Found recent task ${recentTask.id} to associate response with`);
    }
  }

  for (const task of tasks) {
    console.log(`[TaskManager] Updating task ${task.id} with ${role} response`);

    // Append message to task's message chain
    const existingChain = task.message_chain_ids || '';
    const updatedChain = existingChain ? `${existingChain},${messageId}` : messageId;

    // Determine new status based on response content
    let newStatus = task.status;
    let notifyGuest = false;
    let guestMessage = '';

    // Simple keyword detection for status updates
    const lowerBody = body.toLowerCase();
    
    if (lowerBody.includes('done') || lowerBody.includes('completed') || lowerBody.includes('delivered') || lowerBody.includes('finished')) {
      newStatus = 'Completed';
      notifyGuest = true;
      guestMessage = `Good news! Your request for "${task.task_bucket || task.action_title}" has been completed. Is there anything else we can help you with?`;
    } else if (lowerBody.includes('on my way') || lowerBody.includes('coming') || lowerBody.includes('will be there')) {
      newStatus = 'In Progress';
      notifyGuest = true;
      guestMessage = `Update: Our team is on their way to help with your "${task.task_bucket || task.action_title}" request.`;
    } else if (lowerBody.includes('delay') || lowerBody.includes('later') || lowerBody.includes('busy')) {
      newStatus = 'In Progress';
      notifyGuest = true;
      guestMessage = `Update: There may be a short delay with your "${task.task_bucket || task.action_title}" request. We'll get to you as soon as possible.`;
    } else if (lowerBody.includes('cannot') || lowerBody.includes("can't") || lowerBody.includes('unable') || lowerBody.includes('no stock')) {
      newStatus = 'Escalated';
      // May need host intervention
    }

    // Update task
    await db.prepare(`
      UPDATE tasks SET 
        status = ?,
        message_chain_ids = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newStatus, updatedChain, task.id);

    // Log the response in task logs
    await db.prepare(`
      INSERT INTO d_task_logs (task_id, action, actor, message, created_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(task.id, `${role} Response`, role, body);

    // Notify guest if needed
    if (notifyGuest && task.phone) {
      try {
        await sendWhatsAppMessage({
          to: task.phone,
          body: guestMessage,
          recipientType: 'Guest',
          metadata: {
            propertyId: task.property_id,
            bookingId: task.booking_id,
            taskId: task.id,
            referenceMessageIds: messageId,
          },
        });
        console.log(`[TaskManager] Notified guest of task update: ${task.id}`);
      } catch (err) {
        console.error(`[TaskManager] Failed to notify guest:`, err.message);
      }
    }

    results.push({
      taskId: task.id,
      previousStatus: task.status,
      newStatus,
      notifiedGuest: notifyGuest,
    });
  }

  return results;
}

export default {
  createTasksFromAiLogs,
  processTaskWorkflow,
  evaluateTaskStatus,
  archiveCompletedTasks,
  getActiveTasks,
  getTaskById,
  updateTask,
  processStaffHostResponse,
};
