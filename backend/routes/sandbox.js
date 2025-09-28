import express from 'express';
import { validationResult, body, param, query } from 'express-validator';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { setAccountContext } from '../middleware/setAccountContext.js';
import sandboxAIService from '../services/sandboxAIService.js';

const router = express.Router();

// Apply authentication and account context to all routes
router.use(authenticateToken);
router.use(setAccountContext);

// Helper function to set RLS context
const setRLSContext = async (client, accountId, userId) => {
  if (accountId && userId) {
    await client.query(`SET app.current_account_id = '${accountId}'`);
    await client.query(`SET app.current_user_id = '${userId}'`);
  }
};

// POST /api/sandbox/initialize - Initialize a new sandbox session
router.post('/initialize', [
  body('session_name').optional().trim().isLength({ max: 255 }),
  body('scenario').isObject().withMessage('Scenario data is required'),
  body('scenario.property_id').isInt({ min: 1 }).withMessage('Valid property_id is required'),
  body('scenario.guest_name').trim().notEmpty().withMessage('Guest name is required'),
  body('scenario.guest_phone').optional().trim(),
  body('scenario.check_in_date').isISO8601().withMessage('Valid check-in date required'),
  body('scenario.check_out_date').isISO8601().withMessage('Valid check-out date required'),
  body('scenario.initial_context').optional().trim()
], async (req, res) => {
  const client = await pool.connect();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { session_name, scenario } = req.body;
    const { accountId, userId } = req.user;

    await setRLSContext(client, accountId, userId);

    // Validate property exists and belongs to user's account
    const propertyCheck = await client.query(`
      SELECT id, property_title FROM properties
      WHERE id = $1 AND account_id = $2
    `, [scenario.property_id, accountId]);

    if (propertyCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Property not found or access denied'
      });
    }

    // Auto-generate session name if not provided
    const autoSessionName = session_name || `${scenario.guest_name} - ${propertyCheck.rows[0].property_title}`;

    // Create sandbox session
    const sessionResult = await client.query(`
      INSERT INTO sandbox_sessions (
        account_id, created_by, session_name, scenario_data
      ) VALUES ($1, $2, $3, $4)
      RETURNING id, created_at
    `, [
      accountId,
      userId,
      autoSessionName,
      scenario
    ]);

    const session = sessionResult.rows[0];

    // If there's initial context, create an initial message
    if (scenario.initial_context) {
      const messageUuid = `INIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      await client.query(`
        INSERT INTO message_log (
          account_id, message_uuid, timestamp, from_number, to_number,
          message_body, message_type, requestor_role, is_sandbox,
          sandbox_session_id, sandbox_metadata
        ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, TRUE, $8, $9)
      `, [
        accountId,
        messageUuid,
        scenario.guest_phone || '+1234567890',
        'Host',
        scenario.initial_context,
        'Inbound',
        'guest',
        session.id,
        { initial_message: true, scenario }
      ]);
    }

    res.status(201).json({
      success: true,
      data: {
        session_id: session.id,
        session_name: autoSessionName,
        property: propertyCheck.rows[0],
        scenario,
        created_at: session.created_at
      }
    });

  } catch (error) {
    console.error('Error initializing sandbox session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to initialize sandbox session'
    });
  } finally {
    client.release();
  }
});

// GET /api/sandbox/sessions - Get user's sandbox sessions
router.get('/sessions', [
  query('active_only').optional().isBoolean()
], async (req, res) => {
  const client = await pool.connect();

  try {
    const { accountId, userId } = req.user;
    const { active_only = true } = req.query;

    await setRLSContext(client, accountId, userId);

    let whereClause = 'WHERE ss.account_id = $1';
    const params = [accountId];

    if (active_only === 'true') {
      whereClause += ' AND ss.is_active = TRUE';
    }

    const sessionsQuery = `
      SELECT
        ss.*,
        p.property_title as property_name,
        COUNT(DISTINCT ml.id) as message_count,
        COUNT(DISTINCT st.id) as task_count
      FROM sandbox_sessions ss
      LEFT JOIN properties p ON (ss.scenario_data->>'property_id')::INTEGER = p.id
      LEFT JOIN message_log ml ON ml.sandbox_session_id = ss.id
      LEFT JOIN sandbox_tasks st ON st.sandbox_session_id = ss.id
      ${whereClause}
      GROUP BY ss.id, p.property_title
      ORDER BY ss.created_at DESC
    `;

    const result = await client.query(sessionsQuery, params);

    res.json({
      success: true,
      data: result.rows.map(session => ({
        id: session.id,
        session_name: session.session_name,
        scenario_data: session.scenario_data,
        property_name: session.property_name,
        message_count: parseInt(session.message_count),
        task_count: parseInt(session.task_count),
        is_active: session.is_active,
        created_at: session.created_at,
        updated_at: session.updated_at
      }))
    });

  } catch (error) {
    console.error('Error fetching sandbox sessions:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch sandbox sessions'
    });
  } finally {
    client.release();
  }
});

// GET /api/sandbox/session/:sessionId - Get specific session details
router.get('/session/:sessionId', [
  param('sessionId').isUUID().withMessage('Valid session ID required')
], async (req, res) => {
  const client = await pool.connect();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId } = req.params;
    const { accountId, userId } = req.user;

    await setRLSContext(client, accountId, userId);

    // Get session with messages and tasks
    const sessionQuery = `
      SELECT
        ss.*,
        p.property_title as property_name,
        p.property_location as property_address,
        p.check_in_time,
        p.check_out_time
      FROM sandbox_sessions ss
      LEFT JOIN properties p ON (ss.scenario_data->>'property_id')::INTEGER = p.id
      WHERE ss.id = $1 AND ss.account_id = $2
    `;

    const sessionResult = await client.query(sessionQuery, [sessionId, accountId]);

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    const session = sessionResult.rows[0];

    // Get messages
    const messagesQuery = `
      SELECT * FROM message_log
      WHERE sandbox_session_id = $1
      ORDER BY timestamp ASC
    `;

    const messages = await client.query(messagesQuery, [sessionId]);

    // Get tasks
    const tasksQuery = `
      SELECT * FROM sandbox_tasks
      WHERE sandbox_session_id = $1
      ORDER BY created_at DESC
    `;

    const tasks = await client.query(tasksQuery, [sessionId]);

    res.json({
      success: true,
      data: {
        session: {
          id: session.id,
          session_name: session.session_name,
          scenario_data: session.scenario_data,
          property: {
            name: session.property_name,
            address: session.property_address,
            check_in_time: session.check_in_time,
            check_out_time: session.check_out_time
          },
          is_active: session.is_active,
          created_at: session.created_at,
          updated_at: session.updated_at
        },
        messages: messages.rows,
        tasks: tasks.rows
      }
    });

  } catch (error) {
    console.error('Error fetching session details:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch session details'
    });
  } finally {
    client.release();
  }
});

// POST /api/sandbox/message - Send a message in sandbox
router.post('/message', [
  body('session_id').isUUID().withMessage('Valid session ID required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('sender_type').isIn(['guest', 'host', 'staff']).withMessage('Valid sender type required'),
  body('sender_name').optional().trim()
], async (req, res) => {
  const client = await pool.connect();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('[Sandbox Message] Validation failed:', errors.array());
      console.log('[Sandbox Message] Request body:', req.body);
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { session_id, message, sender_type, sender_name } = req.body;
    const { accountId, userId } = req.user;

    await setRLSContext(client, accountId, userId);

    // Verify session belongs to user
    const sessionCheck = await client.query(`
      SELECT id, scenario_data FROM sandbox_sessions
      WHERE id = $1 AND account_id = $2 AND is_active = TRUE
    `, [session_id, accountId]);

    if (sessionCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found or inactive'
      });
    }

    const scenario = sessionCheck.rows[0].scenario_data;
    const messageUuid = `MSG_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Determine message direction and phone numbers
    let fromNumber, toNumber, messageType, requestorRole;

    if (sender_type === 'guest') {
      fromNumber = scenario.guest_phone || '+1234567890';
      toNumber = 'Host';
      messageType = 'Inbound';
      requestorRole = 'guest';
    } else {
      fromNumber = sender_name || 'Host';
      toNumber = scenario.guest_phone || '+1234567890';
      messageType = 'Outbound';
      requestorRole = sender_type === 'host' ? 'host' : 'staff';
    }

    // Insert message
    await client.query(`
      INSERT INTO message_log (
        account_id, message_uuid, timestamp, from_number, to_number,
        message_body, message_type, requestor_role, is_sandbox,
        sandbox_session_id, sandbox_metadata
      ) VALUES ($1, $2, NOW(), $3, $4, $5, $6, $7, TRUE, $8, $9)
    `, [
      accountId,
      messageUuid,
      fromNumber,
      toNumber,
      message,
      messageType,
      requestorRole,
      session_id,
      { sender_type, sender_name }
    ]);

    // Check if this is a guest message and auto-response should be triggered
    const shouldAutoRespond = sender_type === 'guest' && req.body.auto_response === true;

    console.log(`[Sandbox Message] Message sent:`, {
      session_id,
      sender_type,
      auto_response: req.body.auto_response,
      shouldAutoRespond
    });

    let aiResponse = null;
    if (shouldAutoRespond) {
      try {
        console.log(`[Sandbox] Triggering AI auto-response for guest message in session ${session_id}`);

        // Trigger AI processing asynchronously to avoid blocking the response
        setImmediate(async () => {
          try {
            console.log(`[Sandbox] Starting AI automation for session ${session_id}`);
            await sandboxAIService.runFullAutomation(session_id, accountId);
            console.log(`[Sandbox] AI processing completed for session ${session_id}`);
          } catch (error) {
            console.error(`[Sandbox] AI processing failed for session ${session_id}:`, error);
          }
        });

        aiResponse = { triggered: true, message: 'AI response processing initiated' };
      } catch (error) {
        console.error('Error triggering AI response:', error);
        aiResponse = { triggered: false, error: error.message };
      }
    } else {
      console.log(`[Sandbox] AI auto-response NOT triggered for session ${session_id}:`, {
        sender_type,
        auto_response: req.body.auto_response,
        isGuest: sender_type === 'guest',
        autoResponseEnabled: req.body.auto_response === true
      });
    }

    res.status(201).json({
      success: true,
      data: {
        message_uuid: messageUuid,
        message,
        sender_type,
        timestamp: new Date().toISOString(),
        ai_response: aiResponse
      }
    });

  } catch (error) {
    console.error('Error sending sandbox message:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to send sandbox message'
    });
  } finally {
    client.release();
  }
});

// POST /api/sandbox/process - Trigger AI processing for a session
router.post('/process', [
  body('session_id').isUUID().withMessage('Valid session ID required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { session_id } = req.body;
    const { accountId } = req.user;

    // Verify session belongs to user
    const client = await pool.connect();
    try {
      await setRLSContext(client, accountId, req.user.userId);

      const sessionCheck = await client.query(`
        SELECT id FROM sandbox_sessions
        WHERE id = $1 AND account_id = $2 AND is_active = TRUE
      `, [session_id, accountId]);

      if (sessionCheck.rows.length === 0) {
        return res.status(404).json({
          error: 'Session not found or inactive'
        });
      }
    } finally {
      client.release();
    }

    // Run AI processing
    const result = await sandboxAIService.runFullAutomation(session_id, accountId);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error processing sandbox session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to process sandbox session'
    });
  }
});

// DELETE /api/sandbox/session/:sessionId - Delete/deactivate a sandbox session
router.delete('/session/:sessionId', [
  param('sessionId').isUUID().withMessage('Valid session ID required')
], async (req, res) => {
  const client = await pool.connect();

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { sessionId } = req.params;
    const { accountId, userId } = req.user;

    await setRLSContext(client, accountId, userId);

    // Mark session as inactive instead of deleting (preserve data for analysis)
    const result = await client.query(`
      UPDATE sandbox_sessions
      SET is_active = FALSE, updated_at = NOW()
      WHERE id = $1 AND account_id = $2
      RETURNING id
    `, [sessionId, accountId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      message: 'Session deactivated successfully'
    });

  } catch (error) {
    console.error('Error deactivating sandbox session:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to deactivate sandbox session'
    });
  } finally {
    client.release();
  }
});

// GET /api/sandbox/properties - Get properties for scenario setup
router.get('/properties', async (req, res) => {
  const client = await pool.connect();

  try {
    const { accountId, userId } = req.user;

    await setRLSContext(client, accountId, userId);

    const result = await client.query(`
      SELECT id, property_title as name, property_location as address, check_in_time, check_out_time
      FROM properties
      WHERE account_id = $1
      ORDER BY property_title ASC
    `, [accountId]);

    res.json({
      success: true,
      data: result.rows
    });

  } catch (error) {
    console.error('Error fetching properties:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to fetch properties'
    });
  } finally {
    client.release();
  }
});

export default router;