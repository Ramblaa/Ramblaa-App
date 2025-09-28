import OpenAI from 'openai';
import pool from '../config/database.js';

class SandboxAIService {
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || apiKey === 'your-openai-api-key-here') {
      console.warn('OpenAI API key not configured - using mock responses for demo');
      this.openai = null;
    } else {
      this.openai = new OpenAI({
        apiKey: apiKey
      });
    }
    this.model = 'gpt-4o-mini';
  }

  /**
   * Main orchestrator function - runs the complete automation pipeline
   */
  async runFullAutomation(sessionId, accountId) {
    console.log(`Starting sandbox automation for session: ${sessionId}`);

    try {
      // 1. Process and summarize new messages
      console.log('[SandboxAI] Step 1: Processing and summarizing messages...');
      const summaries = await this.processSummarizeMessages(sessionId, accountId);
      console.log(`[SandboxAI] Step 1 completed: Found ${summaries.length} summaries`);

      // 2. Generate AI responses based on summaries
      console.log('[SandboxAI] Step 2: Building AI responses from summaries...');
      const responses = await this.buildAiResponseFromSummaries(sessionId, summaries);
      console.log(`[SandboxAI] Step 2 completed: Generated ${responses.length} responses`);

      // 3. Create tasks if needed
      console.log('[SandboxAI] Step 3: Creating staff tasks...');
      const tasks = await this.createStaffTasks(sessionId, summaries);
      console.log(`[SandboxAI] Step 3 completed: Created ${tasks.length} tasks`);

      // 4. Evaluate task status and generate follow-ups
      console.log('[SandboxAI] Step 4: Evaluating task status...');
      const followUps = await this.evaluateTaskStatus(sessionId);
      console.log(`[SandboxAI] Step 4 completed: Generated ${followUps.length} follow-ups`);

      // 5. Process any escalations
      console.log('[SandboxAI] Step 5: Processing escalations...');
      const escalations = await this.processHostEscalations(sessionId, summaries);
      console.log(`[SandboxAI] Step 5 completed: Processed ${escalations.length} escalations`);

      return {
        summaries,
        responses,
        tasks,
        followUps,
        escalations,
        success: true
      };
    } catch (error) {
      console.error('Sandbox automation error:', error);
      throw error;
    }
  }

  /**
   * Process and summarize incoming messages
   */
  async processSummarizeMessages(sessionId, accountId) {
    const client = await pool.connect();

    try {
      // Get unprocessed messages from this sandbox session
      const messagesQuery = `
        SELECT
          ml.*,
          ss.scenario_data,
          p.property_title as property_name,
          p.property_location as property_address,
          p.check_in_time,
          p.check_out_time
        FROM message_log ml
        JOIN sandbox_sessions ss ON ml.sandbox_session_id = ss.id
        LEFT JOIN properties p ON (ss.scenario_data->>'property_id')::INTEGER = p.id
        WHERE ml.sandbox_session_id = $1
        AND ml.is_sandbox = TRUE
        AND ml.message_type = 'Inbound'
        AND NOT EXISTS (
          SELECT 1 FROM sandbox_ai_processing sap
          WHERE sap.sandbox_session_id = ml.sandbox_session_id
          AND sap.message_uuid = ml.message_uuid
          AND sap.processing_type = 'summarization'
          AND sap.processing_status = 'completed'
        )
        ORDER BY ml.timestamp ASC
      `;

      const messages = await client.query(messagesQuery, [sessionId]);

      const summaries = [];

      for (const message of messages.rows) {
        // Get conversation history for context
        const historyQuery = `
          SELECT message_body, message_type, timestamp
          FROM message_log
          WHERE sandbox_session_id = $1
          AND timestamp < $2
          ORDER BY timestamp DESC
          LIMIT 10
        `;

        const history = await client.query(historyQuery, [sessionId, message.timestamp]);

        // Build context for AI
        const context = this.buildMessageContext(message, history.rows);

        // Generate summary using AI
        const summary = await this.generateMessageSummary(context, message);

        // Store the summary in processing table
        await client.query(`
          INSERT INTO sandbox_ai_processing (
            sandbox_session_id, message_uuid, processing_type,
            input_data, output_data, ai_model, processing_status, processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
          sessionId,
          message.message_uuid,
          'summarization',
          { message: message.message_body, context },
          summary,
          this.model,
          'completed'
        ]);

        summaries.push({
          message_uuid: message.message_uuid,
          original_message: message.message_body,
          summary
        });
      }

      return summaries;
    } finally {
      client.release();
    }
  }

  /**
   * Build context for message processing
   */
  buildMessageContext(message, history) {
    const scenarioData = message.scenario_data || {};

    return {
      property: {
        id: scenarioData.property_id,
        name: message.property_name,
        address: message.property_address,
        checkIn: message.check_in_time,
        checkOut: message.check_out_time
      },
      guest: {
        name: scenarioData.guest_name || 'Guest',
        phone: message.from_number,
        bookingDates: {
          checkIn: scenarioData.check_in_date,
          checkOut: scenarioData.check_out_date
        }
      },
      conversationHistory: history.map(h => ({
        text: h.message_body,
        type: h.message_type,
        timestamp: h.timestamp
      }))
    };
  }

  /**
   * Generate AI summary of a message
   */
  async generateMessageSummary(context, message) {
    // If no OpenAI API key, return mock response
    if (!this.openai) {
      return this.getMockSummary(message.message_body);
    }

    const prompt = `
You are an AI assistant for a property management system. Analyze this guest message and provide a structured summary.

Property: ${context.property.name}
Guest: ${context.guest.name}
Current Message: "${message.message_body}"

Recent Conversation History:
${context.conversationHistory.map(h => `${h.type}: ${h.text}`).join('\n')}

Please provide a JSON response with:
{
  "language": "detected language (en, es, fr, etc.)",
  "sentiment": "positive/neutral/negative/urgent",
  "tone": "friendly/formal/frustrated/confused",
  "actionRequired": true/false,
  "actionTitle": "brief description of what needs to be done",
  "category": "booking/maintenance/check-in/check-out/amenities/complaint/general",
  "priority": "low/medium/high/urgent",
  "keyInformation": ["list of important details extracted"],
  "suggestedResponse": "brief suggested response to the guest"
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a helpful property management assistant. Always respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error('Error generating summary:', error);
      return this.getMockSummary(message.message_body);
    }
  }

  /**
   * Generate mock summary for demo purposes
   */
  getMockSummary(messageText) {
    const message = messageText.toLowerCase();

    // Simple keyword-based analysis for demo
    let category = 'general';
    let actionRequired = false;
    let priority = 'medium';
    let sentiment = 'neutral';
    let actionTitle = 'Message received';

    if (message.includes('key') || message.includes('check in') || message.includes('access')) {
      category = 'check-in';
      actionRequired = true;
      priority = 'high';
      actionTitle = 'Help with property access';
    } else if (message.includes('wifi') || message.includes('broken') || message.includes('fix')) {
      category = 'maintenance';
      actionRequired = true;
      priority = 'medium';
      actionTitle = 'Maintenance request';
    } else if (message.includes('noise') || message.includes('complaint') || message.includes('problem')) {
      category = 'complaint';
      actionRequired = true;
      priority = 'high';
      sentiment = 'negative';
      actionTitle = 'Address guest complaint';
    } else if (message.includes('clean')) {
      category = 'cleaning';
      actionRequired = true;
      priority = 'medium';
      actionTitle = 'Cleaning request';
    }

    return {
      language: 'en',
      sentiment,
      tone: sentiment === 'negative' ? 'frustrated' : 'friendly',
      actionRequired,
      actionTitle,
      category,
      priority,
      keyInformation: [actionTitle],
      suggestedResponse: actionRequired ?
        `Thank you for letting me know. I'll take care of this right away.` :
        `Thank you for your message. Is there anything I can help you with?`
    };
  }

  /**
   * Generate AI responses based on message summaries
   */
  async buildAiResponseFromSummaries(sessionId, summaries) {
    console.log(`[SandboxAI] buildAiResponseFromSummaries: Processing ${summaries.length} summaries`);
    const client = await pool.connect();
    const responses = [];

    try {
      for (const [index, summary] of summaries.entries()) {
        console.log(`[SandboxAI] Processing summary ${index + 1}/${summaries.length}:`, {
          actionRequired: summary.summary.actionRequired,
          category: summary.summary.category,
          priority: summary.summary.priority
        });

        // Skip if no action required
        if (!summary.summary.actionRequired) {
          console.log(`[SandboxAI] Skipping summary ${index + 1}: No action required`);
          continue;
        }

        console.log(`[SandboxAI] Processing summary ${index + 1}: Action required, getting property data...`);

        // Get property FAQs and templates
        const propertyData = await this.getPropertyData(sessionId, client);

        console.log(`[SandboxAI] Processing summary ${index + 1}: Generating AI response...`);

        // Generate appropriate response
        const response = await this.generateAiResponse(summary, propertyData);

        // Store the response as an outbound message
        const messageUuid = `RESP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        await client.query(`
          INSERT INTO message_log (
            account_id, message_uuid, timestamp, from_number, to_number,
            message_body, message_type, requestor_role, is_sandbox,
            sandbox_session_id, sandbox_metadata
          ) VALUES (
            (SELECT account_id FROM sandbox_sessions WHERE id = $1),
            $2, NOW(), $3, $4, $5, $6, $7, TRUE, $1, $8
          )
        `, [
          sessionId,
          messageUuid,
          'System', // From (host/AI)
          summary.original_message.from_number || 'Guest',
          response.message,
          'Outbound',
          'ai',
          {
            generated_from: summary.message_uuid,
            summary: summary.summary
          }
        ]);

        // Record AI processing
        await client.query(`
          INSERT INTO sandbox_ai_processing (
            sandbox_session_id, message_uuid, processing_type,
            input_data, output_data, ai_model, processing_status, processed_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        `, [
          sessionId,
          messageUuid,
          'response_generation',
          { summary: summary.summary },
          response,
          this.model,
          'completed'
        ]);

        responses.push({
          message_uuid: messageUuid,
          response: response.message,
          metadata: response
        });
      }

      return responses;
    } finally {
      client.release();
    }
  }

  /**
   * Get property data for context
   */
  async getPropertyData(sessionId, client) {
    const query = `
      SELECT
        ss.scenario_data,
        p.*,
        COALESCE(
          array_agg(DISTINCT f.*) FILTER (WHERE f.id IS NOT NULL),
          ARRAY[]::faqs[]
        ) as faqs
      FROM sandbox_sessions ss
      LEFT JOIN properties p ON (ss.scenario_data->>'property_id')::INTEGER = p.id
      LEFT JOIN faqs f ON f.property_id = p.id
      WHERE ss.id = $1
      GROUP BY ss.id, ss.scenario_data, p.id
    `;

    const result = await client.query(query, [sessionId]);
    const data = result.rows[0] || {};

    // Ensure faqs is always an array
    if (!Array.isArray(data.faqs)) {
      data.faqs = [];
    }

    // Debug logging to see what property data we have
    console.log('[SandboxAI] Property data retrieved:', {
      propertyId: data.id,
      propertyTitle: data.property_title,
      columns: Object.keys(data).filter(key => key.startsWith('wifi') || key.includes('password') || key.includes('WiFi'))
    });

    return data;
  }

  /**
   * Build comprehensive property information string from all available data
   */
  buildComprehensivePropertyInfo(propertyData) {
    if (!propertyData || !propertyData.id) {
      return 'Property Information: Not available';
    }

    // Core property fields mapping
    const fieldMappings = {
      'Property Name': propertyData.property_title || propertyData.name,
      'Address': propertyData.property_location || propertyData.address,
      'Check-in Time': propertyData.check_in_time,
      'Check-out Time': propertyData.check_out_time,
      'WiFi Network': propertyData.wifi_network_name,
      'WiFi Password': propertyData.wifi_password,
      'Number of Bedrooms': propertyData.bedrooms,
      'Number of Bathrooms': propertyData.bathrooms,
      'Max Guests': propertyData.max_guests,
      'Property Type': propertyData.property_type,
      'Description': propertyData.description,
      'House Rules': propertyData.house_rules,
      'Amenities': propertyData.amenities,
      'Parking Information': propertyData.parking_info,
      'Emergency Contact': propertyData.emergency_contact,
      'Host Phone': propertyData.host_phone,
      'Host Email': propertyData.host_email,
      'Local Area Information': propertyData.local_area_info,
      'Transportation': propertyData.transportation_info,
      'Nearby Attractions': propertyData.nearby_attractions,
      'Restaurant Recommendations': propertyData.restaurant_recommendations,
      'Grocery Stores': propertyData.grocery_stores,
      'Medical Facilities': propertyData.medical_facilities,
      'Pet Policy': propertyData.pet_policy,
      'Smoking Policy': propertyData.smoking_policy,
      'Noise Policy': propertyData.noise_policy,
      'Party Policy': propertyData.party_policy,
      'Additional Instructions': propertyData.additional_instructions,
      'Cleaning Instructions': propertyData.cleaning_instructions,
      'Appliance Instructions': propertyData.appliance_instructions,
      'Heating/Cooling': propertyData.hvac_instructions,
      'Security System': propertyData.security_system_info,
      'Key/Access Information': propertyData.key_access_info
    };

    // Filter out empty/null values and build property info string
    const propertyLines = [];
    propertyLines.push('Property Information:');

    Object.entries(fieldMappings).forEach(([label, value]) => {
      if (value && String(value).trim() && String(value).trim() !== 'null') {
        propertyLines.push(`- ${label}: ${value}`);
      }
    });

    // Also include any additional data that might be stored in other columns
    const excludeKeys = ['id', 'account_id', 'created_at', 'updated_at', 'is_active', 'faqs', 'scenario_data'];
    Object.keys(propertyData).forEach(key => {
      if (!excludeKeys.includes(key) && !Object.values(fieldMappings).includes(propertyData[key])) {
        const value = propertyData[key];
        if (value && String(value).trim() && String(value).trim() !== 'null') {
          const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
          propertyLines.push(`- ${label}: ${value}`);
        }
      }
    });

    return propertyLines.join('\n');
  }

  /**
   * Generate AI response to guest
   */
  async generateAiResponse(summary, propertyData) {
    console.log('[SandboxAI] Generating AI response for summary:', JSON.stringify(summary, null, 2));

    // If no OpenAI API key, return mock response
    if (!this.openai) {
      console.log('[SandboxAI] No OpenAI API key found, returning mock response');
      return this.getMockResponse(summary.summary);
    }

    console.log('[SandboxAI] OpenAI API key available, proceeding with AI generation...');

    // Ensure FAQs is an array for safe processing
    const faqsArray = Array.isArray(propertyData.faqs) ? propertyData.faqs : [];
    const validFaqs = faqsArray.filter(f => f && f.question && f.answer);

    // Build comprehensive property information from all available data
    const propertyInfo = this.buildComprehensivePropertyInfo(propertyData);

    const prompt = `
You are a helpful property host assistant. Generate a friendly, professional response to the guest.

Guest Message Summary:
${JSON.stringify(summary.summary, null, 2)}

${propertyInfo}

Available FAQs:
${validFaqs.length > 0 ? validFaqs.map(f => `Q: ${f.question}\nA: ${f.answer}`).join('\n\n') : 'None'}

Generate a response that:
1. Addresses the guest's concern
2. Provides helpful information
3. Maintains a ${summary.summary.tone === 'frustrated' ? 'empathetic and apologetic' : 'friendly and professional'} tone
4. Is concise and clear
5. If the issue requires human intervention, mention that the host will follow up

Respond with JSON:
{
  "message": "the response message to send",
  "requiresFollowUp": true/false,
  "escalationNeeded": true/false,
  "taskType": "cleaning/maintenance/none"
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a helpful property management assistant. Respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      return JSON.parse(completion.choices[0].message.content);
    } catch (error) {
      console.error('Error generating response:', error);
      return this.getMockResponse(summary.summary);
    }
  }

  /**
   * Generate mock response for demo purposes
   */
  getMockResponse(summary) {
    let message = "Thank you for your message! ";
    let taskType = 'none';
    let escalationNeeded = false;

    switch(summary.category) {
      case 'check-in':
        message += "The door code is 1234. You can find detailed check-in instructions in your booking confirmation.";
        break;
      case 'maintenance':
        message += "I'm sorry to hear about this issue. I'll send someone to take a look at it right away.";
        taskType = 'maintenance';
        break;
      case 'cleaning':
        message += "I'll arrange for housekeeping to address this immediately.";
        taskType = 'cleaning';
        break;
      case 'complaint':
        message += "I sincerely apologize for this inconvenience. I'm taking immediate action to resolve this issue.";
        escalationNeeded = true;
        break;
      default:
        message += "Is there anything specific I can help you with during your stay?";
    }

    return {
      message,
      requiresFollowUp: summary.priority === 'high',
      escalationNeeded,
      taskType
    };
  }

  /**
   * Create staff tasks based on message analysis
   */
  async createStaffTasks(sessionId, summaries) {
    const client = await pool.connect();
    const tasks = [];

    try {
      for (const summary of summaries) {
        // Check if task creation is needed
        const needsTask = summary.summary.actionRequired &&
                         ['maintenance', 'cleaning', 'urgent'].includes(summary.summary.priority);

        if (!needsTask) continue;

        // Determine task type and assignee
        const taskDetails = this.determineTaskDetails(summary.summary);

        const taskUuid = `TASK_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create task
        await client.query(`
          INSERT INTO sandbox_tasks (
            sandbox_session_id, task_uuid, task_type, title, description,
            property_id, assignee_name, assignee_role, status, priority,
            created_from_message_uuid, metadata
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          sessionId,
          taskUuid,
          taskDetails.type,
          taskDetails.title,
          taskDetails.description,
          taskDetails.property_id,
          taskDetails.assignee_name,
          taskDetails.assignee_role,
          'pending',
          summary.summary.priority,
          summary.message_uuid,
          { summary: summary.summary }
        ]);

        tasks.push({
          task_uuid: taskUuid,
          ...taskDetails
        });
      }

      return tasks;
    } finally {
      client.release();
    }
  }

  /**
   * Determine task details from summary
   */
  determineTaskDetails(summary) {
    const baseDetails = {
      title: summary.actionTitle || 'Guest Request',
      description: `Category: ${summary.category}\nPriority: ${summary.priority}\nDetails: ${summary.keyInformation.join(', ')}`
    };

    // Determine task type and assignee based on category
    switch(summary.category) {
      case 'maintenance':
        return {
          ...baseDetails,
          type: 'maintenance',
          assignee_name: 'Maintenance Team',
          assignee_role: 'Maintenance Staff'
        };
      case 'cleaning':
        return {
          ...baseDetails,
          type: 'cleaning',
          assignee_name: 'Cleaning Team',
          assignee_role: 'Cleaning Staff'
        };
      case 'complaint':
        return {
          ...baseDetails,
          type: 'inspection',
          assignee_name: 'Property Manager',
          assignee_role: 'Management'
        };
      default:
        return {
          ...baseDetails,
          type: 'general',
          assignee_name: 'Support Team',
          assignee_role: 'Support Staff'
        };
    }
  }

  /**
   * Evaluate task status and generate follow-ups
   */
  async evaluateTaskStatus(sessionId) {
    const client = await pool.connect();

    try {
      // Get open tasks
      const tasksQuery = `
        SELECT * FROM sandbox_tasks
        WHERE sandbox_session_id = $1
        AND status IN ('pending', 'in-progress')
        ORDER BY created_at ASC
      `;

      const tasks = await client.query(tasksQuery, [sessionId]);
      const followUps = [];

      for (const task of tasks.rows) {
        // Check if task needs follow-up (e.g., been pending too long)
        const hoursSinceCreated = (Date.now() - new Date(task.created_at)) / (1000 * 60 * 60);

        if (hoursSinceCreated > 2 && task.status === 'pending') {
          followUps.push({
            task_uuid: task.task_uuid,
            message: `Following up on ${task.title} - this task has been pending for ${Math.round(hoursSinceCreated)} hours.`,
            type: 'reminder'
          });
        }
      }

      return followUps;
    } finally {
      client.release();
    }
  }

  /**
   * Process host escalations for urgent matters
   */
  async processHostEscalations(sessionId, summaries) {
    const escalations = [];

    for (const summary of summaries) {
      if (summary.summary.priority === 'urgent' || summary.summary.sentiment === 'urgent') {
        escalations.push({
          message_uuid: summary.message_uuid,
          reason: 'Urgent guest request',
          summary: summary.summary,
          recommended_action: 'Immediate host attention required'
        });
      }
    }

    return escalations;
  }
}

export default new SandboxAIService();