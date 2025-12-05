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
  // Only process logs from the last 24 hours to avoid old/stale data
  const logs = await db.prepare(`
    SELECT * FROM ai_logs 
    WHERE task_required = 1 
    AND task_created = 0 
    AND recipient_type = 'Guest'
    AND created_at > NOW() - INTERVAL '24 hours'
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
    
    // Wrap in try-catch to ALWAYS mark log as processed, even on error
    try {
      // Skip only if bucket is empty (AI didn't identify any task)
      // "Other" bucket is VALID - these are requests that don't match predefined categories
      if (!log.task_bucket || log.task_bucket.trim() === '') {
        console.log(`[TaskManager] ✗ Skipping - no task bucket identified`);
        await db.prepare(`UPDATE ai_logs SET task_created = 1 WHERE id = ?`).run(log.id);
        continue;
      }
      
      console.log(`[TaskManager] Creating task for bucket: "${log.task_bucket}" (Other buckets are valid!)`)
    
    // Try to find property_id if missing
    let propertyId = log.property_id;
    if (!propertyId && log.booking_id) {
      const booking = await db.prepare(`SELECT property_id FROM bookings WHERE id = ?`).get(log.booking_id);
      if (booking) {
        propertyId = booking.property_id;
        console.log(`[TaskManager] Found property from booking: ${propertyId}`);
      }
    }
    
    // NOTE: Don't skip if no property_id - still create task (just without staff)
    if (!propertyId) {
      console.log(`[TaskManager] ⚠ No property_id found - task will be created without staff assignment`);
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

    // Link the outbound message (the initial response to guest) with this task
    // Find the outbound message that was sent for this ai_log and update its reference_task_ids
    // Set task_action = 'created' to show "Task created" in UI
    try {
      await db.prepare(`
        UPDATE messages 
        SET reference_task_ids = COALESCE(reference_task_ids || ',', '') || ?,
            task_action = 'created'
        WHERE ai_enrichment_id = ? AND message_type = 'Outbound'
      `).run(taskId, log.id);
      console.log(`[TaskManager] Linked task ${taskId} to outbound message (task_action=created)`);
    } catch (linkErr) {
      console.error(`[TaskManager] Failed to link task to message:`, linkErr.message);
    }

    console.log(`[TaskManager] Task ${taskId} created, assigned to: ${task.staff_name || 'unassigned'}`);
    created.push(task);
    
    } catch (taskError) {
      // CRITICAL: Always mark the log as processed, even on error
      // This prevents the same log from being reprocessed and causing duplicate/wrong tasks
      console.error(`[TaskManager] ✗ Error creating task for log ${log.id}:`, taskError.message);
      try {
        await db.prepare(`UPDATE ai_logs SET task_created = 1 WHERE id = ?`).run(log.id);
        console.log(`[TaskManager] Marked failed log ${log.id} as processed to prevent reprocessing`);
      } catch (markError) {
        console.error(`[TaskManager] ✗ Failed to mark log as processed:`, markError.message);
      }
    }
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
  // NOTE: "Other" bucket is now VALID - these are requests without a predefined category
  const tasks = await db.prepare(`
    SELECT * FROM tasks 
    WHERE status != 'Completed' 
    AND status != 'Cancelled'
    AND (completion_notified = 0 OR completion_notified IS NULL)
    AND (action_holder_notified = 0 OR action_holder_notified IS NULL)
    AND task_bucket IS NOT NULL
    AND task_bucket != ''
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
async function handleStaffPath(task, triageResult, guestLang) {
  const db = getDb();

  if (!task.staff_phone) {
    console.log(`[TaskManager] No staff phone for task ${task.id}`);
    return;
  }

  // Get staff's preferred language from staff table
  let staffLang = 'en'; // Default to English
  if (task.staff_id) {
    const staffRecord = await db.prepare('SELECT preferred_language FROM staff WHERE id = ?').get(task.staff_id);
    if (staffRecord?.preferred_language) {
      staffLang = staffRecord.preferred_language;
    }
  }
  
  console.log(`[TaskManager] Staff language: ${staffLang} (guest language: ${guestLang})`);

  const staffName = task.staff_name?.split(' ')[0] || 'there';

  const prompt = fillTemplate(PROMPT_STAFF_INFO_REQUEST, {
    STAFF_LANG: staffLang,
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

// ============================================================================
// AI EVALUATION HELPERS
// ============================================================================

/**
 * Build thread context for AI evaluation
 */
async function buildThreadContext(task, currentMessageId, currentBody, currentRole) {
  const db = getDb();
  
  // Get all messages related to this task
  const messages = await db.prepare(`
    SELECT body, message_type, requestor_role, created_at
    FROM messages
    WHERE booking_id = ? OR from_number = ? OR to_number = ?
    ORDER BY created_at ASC
    LIMIT 30
  `).all(task.booking_id || '', task.phone || '', task.phone || '');
  
  // Format as thread context
  const threadLines = [];
  for (const msg of messages || []) {
    const date = new Date(msg.created_at).toISOString().split('T')[0];
    const role = msg.requestor_role || (msg.message_type === 'Inbound' ? 'Guest' : 'Staff');
    const direction = msg.message_type || 'Inbound';
    threadLines.push(`${date} - ${role} - ${direction} - ${msg.body}`);
  }
  
  // Add the current message
  const today = new Date().toISOString().split('T')[0];
  threadLines.push(`${today} - ${currentRole} - Inbound - ${currentBody}`);
  
  return threadLines.join('\n');
}

/**
 * Use AI to evaluate if staff requirements are met
 */
async function evaluateRequirementsMet(task, threadContext) {
  // Get requirements from task
  const requirements = task.staff_requirements || 'Confirm the task can be completed and provide a time/schedule';
  
  // Build the prompt
  const prompt = fillTemplate(PROMPT_TASK_BOOLEAN_EVAL_USER, {
    REQUIREMENTS: requirements,
    STAFF_MESSAGE: threadContext,
  });
  
  console.log(`[TaskManager] Evaluating requirements: "${requirements}"`);
  
  try {
    // Call AI with system + user messages
    const response = await callGPTTurbo([
      { role: 'system', content: PROMPT_TASK_BOOLEAN_EVAL_SYSTEM },
      { role: 'user', content: prompt },
    ]);
    
    const result = response.trim().toUpperCase();
    console.log(`[TaskManager] AI evaluation result: ${result}`);
    
    return result === 'TRUE';
  } catch (error) {
    console.error(`[TaskManager] AI evaluation error:`, error.message);
    // Default to true if AI fails - we'll generate a response anyway
    return true;
  }
}

/**
 * Use AI to determine if task is COMPLETED or SCHEDULED
 * This handles multiple languages and dynamic phrasing
 * 
 * KEY DISTINCTION:
 * - COMPLETED = Request is RESOLVED (no further action needed by staff)
 * - SCHEDULED = Staff will perform a PHYSICAL ACTION at a future time
 */
async function evaluateTaskCompletionStatus(task, threadContext, staffMessage) {
  const prompt = `You are evaluating a staff response to determine task status.

TASK TYPE: ${task.task_bucket || task.action_title || 'Guest request'}

STAFF'S LATEST MESSAGE:
${staffMessage}

THREAD CONTEXT:
${threadContext}

CRITICAL DISTINCTION - Use reasonable judgment:

**COMPLETED** = The request is RESOLVED. Use for:
- Approval/permission granted (e.g., "Yes you can check-in at 11am", "Early check-in is fine")
- Information confirmed (e.g., "The code is 1234", "Yes that's available")
- Physical task already done (e.g., "Towels delivered", "Pool cleaned", "Fixed it")
- Simple confirmations that don't require future physical action

**SCHEDULED** = Staff will perform a PHYSICAL ACTION later. Use ONLY for:
- Delivery tasks with future time (e.g., "I'll bring towels at 9am tomorrow")
- Maintenance scheduled (e.g., "Technician coming at 2pm")
- Physical work to be done (e.g., "I'll clean the pool this afternoon")

**IN_PROGRESS** = Staff acknowledged but hasn't confirmed resolution or schedule

**ESCALATED** = Staff CANNOT complete the task (unavailable, need approval, etc.)

The staff may write in ANY language. Apply common sense.

Return EXACTLY one word: COMPLETED, SCHEDULED, IN_PROGRESS, or ESCALATED

Answer:`;

  try {
    const response = await callGPTTurbo([
      { role: 'user', content: prompt },
    ]);
    
    const result = response.trim().toUpperCase().replace(/[^A-Z_]/g, '');
    console.log(`[TaskManager] AI completion status: ${result}`);
    
    // Map to valid status
    if (result.includes('COMPLETED')) return 'Completed';
    if (result.includes('SCHEDULED')) return 'Scheduled';
    if (result.includes('ESCALATED')) return 'Escalated';
    return 'In Progress';
  } catch (error) {
    console.error(`[TaskManager] AI status evaluation error:`, error.message);
    return 'In Progress';
  }
}

/**
 * Use AI to generate guest notification message
 */
async function generateGuestNotification(task, threadContext) {
  // Detect language from guest message
  const lang = await detectLanguage(task.guest_message || 'en');
  
  // Build the prompt
  const prompt = fillTemplate(PROMPT_GUEST_TASK_COMPLETED, {
    LANG: lang,
    TASK_SCOPE: task.task_bucket || task.action_title || 'your request',
    GUEST_MESSAGE: task.guest_message || '',
    THREAD_CONTEXT: threadContext,
  });
  
  try {
    const result = await chatJSON(prompt);
    
    // The response might be plain text, not JSON
    let message = result.raw || '';
    
    // Clean up the response
    message = message.trim();
    
    // Remove any markdown or extra formatting
    message = message.replace(/^["']|["']$/g, '');
    
    console.log(`[TaskManager] AI generated guest notification: "${message.substring(0, 100)}..."`);
    
    return message;
  } catch (error) {
    console.error(`[TaskManager] Failed to generate guest notification:`, error.message);
    // Fallback message
    return `Your request for "${task.task_bucket || 'assistance'}" has been acknowledged by our team. We'll update you once it's completed.`;
  }
}

// ============================================================================
// STAFF/HOST RESPONSE PROCESSING
// ============================================================================

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
  
  // Normalize phone number for comparison
  const normalizedPhone = from.replace(/^whatsapp:/i, '').replace(/[^\d+]/g, '');
  const phoneLast10 = normalizedPhone.slice(-10);
  
  console.log(`[TaskManager] Looking for tasks - role: ${role}, staffId: ${staffId}, phone: ${normalizedPhone}`);
  
  if (role === 'Staff') {
    // Strategy 1: Find by staff_id
    if (staffId) {
      tasks = await db.prepare(`
        SELECT * FROM tasks 
        WHERE staff_id = ? AND status NOT IN ('Completed', 'Archived', 'Cancelled')
        ORDER BY created_at DESC
      `).all(staffId);
      console.log(`[TaskManager] Found ${tasks.length} tasks by staff_id`);
    }
    
    // Strategy 2: Find by staff_phone (more reliable)
    if (!tasks.length) {
      tasks = await db.prepare(`
        SELECT * FROM tasks 
        WHERE staff_phone LIKE ? AND status NOT IN ('Completed', 'Archived', 'Cancelled')
        ORDER BY created_at DESC
      `).all(`%${phoneLast10}%`);
      console.log(`[TaskManager] Found ${tasks.length} tasks by staff_phone`);
    }
    
    // Strategy 3: Find any active task waiting on staff
    if (!tasks.length && propertyId) {
      tasks = await db.prepare(`
        SELECT * FROM tasks 
        WHERE property_id = ? AND status = 'Waiting on Staff'
        ORDER BY created_at DESC
      `).all(propertyId);
      console.log(`[TaskManager] Found ${tasks.length} tasks by property waiting on staff`);
    }
  } else if (role === 'Host' && propertyId) {
    // Find tasks escalated to host for this property
    tasks = await db.prepare(`
      SELECT * FROM tasks 
      WHERE property_id = ? AND status = 'Waiting on Host'
      ORDER BY created_at DESC
    `).all(propertyId);
    console.log(`[TaskManager] Found ${tasks.length} tasks waiting on host`);
  }

  if (!tasks.length) {
    // No active tasks - try to find most recent task
    console.log(`[TaskManager] No active tasks found, checking recent tasks...`);
    
    const recentTask = await db.prepare(`
      SELECT * FROM tasks 
      WHERE (staff_phone LIKE ? OR staff_id = ? OR property_id = ?) 
        AND status NOT IN ('Completed', 'Archived', 'Cancelled')
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${phoneLast10}%`, staffId || '', propertyId || '');
    
    if (recentTask) {
      tasks = [recentTask];
      console.log(`[TaskManager] Found recent task ${recentTask.id} (${recentTask.task_bucket}) to associate response with`);
    } else {
      console.log(`[TaskManager] No tasks found at all for this responder`);
    }
  }

  for (const task of tasks) {
    console.log(`[TaskManager] ========================================`);
    console.log(`[TaskManager] Processing ${role} response for task ${task.id}`);
    console.log(`[TaskManager] Task: ${task.task_bucket}, Staff: ${task.staff_name}`);
    console.log(`[TaskManager] ========================================`);

    // Append message to task's message chain
    const existingChain = task.message_chain_ids || '';
    const updatedChain = existingChain ? `${existingChain},${messageId}` : messageId;

    // Build thread context for AI evaluation
    const threadContext = await buildThreadContext(task, messageId, body, role);
    console.log(`[TaskManager] Thread context: ${threadContext.substring(0, 200)}...`);

    // Use AI to evaluate if staff requirements are met
    const requirementsMet = await evaluateRequirementsMet(task, threadContext);
    console.log(`[TaskManager] AI evaluated requirements met: ${requirementsMet}`);

    let newStatus = task.status;
    let notifyGuest = false;
    let guestMessage = '';

    // Use AI to determine the task status (handles any language)
    newStatus = await evaluateTaskCompletionStatus(task, threadContext, body);
    console.log(`[TaskManager] AI determined status: ${newStatus}`);
    
    // Set action holder based on status
    let newActionHolder;
    switch (newStatus) {
      case 'Completed':
        newActionHolder = 'None';  // Task is complete, no one needs to act
        notifyGuest = true;
        break;
      case 'Scheduled':
        newActionHolder = 'Staff';  // Staff still needs to complete it
        notifyGuest = true;
        break;
      case 'Escalated':
        newActionHolder = 'Host';  // Escalate to host
        notifyGuest = false;  // Don't notify guest yet, host will handle
        break;
      default:  // In Progress
        newActionHolder = 'Staff';  // Staff still working on it
        notifyGuest = false;  // Don't spam guest with "in progress" updates
        break;
    }
    
    // Generate AI response to guest if needed
    if (notifyGuest) {
      guestMessage = await generateGuestNotification(task, threadContext);
      console.log(`[TaskManager] AI generated guest message: "${guestMessage?.substring(0, 100)}..."`);
    }

    console.log(`[TaskManager] Status: ${task.status} -> ${newStatus}, ActionHolder: ${task.action_holder} -> ${newActionHolder}`);

    // Build update query based on status
    let updateSql = `
      UPDATE tasks SET 
        status = ?,
        action_holder = ?,
        message_chain_ids = ?,
        response_received = 1,
        updated_at = CURRENT_TIMESTAMP
    `;
    const updateParams = [newStatus, newActionHolder, updatedChain];
    
    // Set scheduled_at when status becomes Scheduled
    if (newStatus === 'Scheduled' && task.status !== 'Scheduled') {
      updateSql += `, scheduled_at = CURRENT_TIMESTAMP`;
      console.log(`[TaskManager] Setting scheduled_at timestamp`);
    }
    
    // Set completed_at when status becomes Completed
    if (newStatus === 'Completed' && task.status !== 'Completed') {
      updateSql += `, completed_at = CURRENT_TIMESTAMP`;
      console.log(`[TaskManager] Setting completed_at timestamp`);
    }
    
    updateSql += ` WHERE id = ?`;
    updateParams.push(task.id);
    
    await db.prepare(updateSql).run(...updateParams);

    // Log the response in task logs
    try {
      await db.prepare(`
        INSERT INTO d_task_logs (task_id, action, actor, message, created_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(task.id, `${role} Response`, role, body);
    } catch (logErr) {
      console.error(`[TaskManager] Failed to log to d_task_logs:`, logErr.message);
    }

    // Notify guest if needed
    if (notifyGuest && guestMessage && task.phone) {
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
        console.log(`[TaskManager] ✓ Notified guest of task update`);
        
        // If task is completed or scheduled, mark completion_notified
        if (newStatus === 'Completed' || newStatus === 'Scheduled') {
          await db.prepare(`
            UPDATE tasks SET completion_notified = 1 WHERE id = ?
          `).run(task.id);
          console.log(`[TaskManager] ✓ Marked task as completion_notified`);
        }
      } catch (err) {
        console.error(`[TaskManager] ✗ Failed to notify guest:`, err.message);
      }
    }

    results.push({
      taskId: task.id,
      previousStatus: task.status,
      newStatus,
      notifiedGuest: notifyGuest,
      guestMessage: guestMessage?.substring(0, 100),
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
