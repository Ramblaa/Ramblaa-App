-- Ramble Database Schema (PostgreSQL)
-- Converged schema with auth + AI messaging

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'user',
  account_id INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  email_verified BOOLEAN DEFAULT false,
  email_verification_token VARCHAR(255),
  email_verification_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);

-- User sessions (for JWT refresh tokens)
CREATE TABLE IF NOT EXISTS user_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  refresh_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(refresh_token);

-- Properties (from d:propertyInfo)
CREATE TABLE IF NOT EXISTS properties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  host_phone TEXT,
  host_name TEXT,
  details_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Staff directory (from d:staff)
CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT DEFAULT 'Staff',
  preferred_language TEXT DEFAULT 'en',
  details_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Bookings (from d:bookingInfo)
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  guest_name TEXT,
  guest_phone TEXT,
  guest_email TEXT,
  start_date DATE,
  end_date DATE,
  details_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- FAQs (from faqs)
CREATE TABLE IF NOT EXISTS faqs (
  id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  sub_category_name TEXT NOT NULL,
  description TEXT,
  details_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Task definitions (from tasks sheet)
CREATE TABLE IF NOT EXISTS task_definitions (
  id SERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  sub_category_name TEXT NOT NULL,
  host_escalation TEXT,
  staff_requirements TEXT,
  guest_requirements TEXT,
  staff_id TEXT,
  staff_name TEXT,
  staff_phone TEXT,
  details_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (staff_id) REFERENCES staff(id)
);

-- Messages log (from d:messageLog)
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  booking_id TEXT,
  property_id TEXT,
  from_number TEXT NOT NULL,
  to_number TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  message_type TEXT DEFAULT 'Inbound',  -- Inbound, Outbound, Scheduled
  requestor_role TEXT,
  staff_id TEXT,
  reference_message_ids TEXT,           -- For scheduled: "ContentSid:HX..." for tracking
  reference_task_ids TEXT,
  task_action TEXT,                      -- 'created', 'updated', or 'scheduled'
  ai_enrichment_id TEXT,
  content_sid TEXT,                      -- Twilio ContentSid for scheduled messages
  content_variables TEXT,                -- JSON of template variables used
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Summarized logs (from d:summarisedLogs)
CREATE TABLE IF NOT EXISTS summarized_logs (
  id TEXT PRIMARY KEY,
  message_id TEXT,
  message_bundle_id TEXT,
  property_id TEXT,
  booking_id TEXT,
  phone TEXT,
  language TEXT DEFAULT 'en',
  tone TEXT,
  sentiment TEXT,
  action_title TEXT NOT NULL,
  original_message TEXT,
  summary_json TEXT,
  status TEXT DEFAULT 'Pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- AI responses (from aiResponse)
CREATE TABLE IF NOT EXISTS ai_responses (
  id TEXT PRIMARY KEY,
  summary_id TEXT,
  message_bundle_id TEXT,
  property_id TEXT,
  booking_id TEXT,
  phone TEXT,
  action_title TEXT,
  summary_json TEXT,
  booking_details_json TEXT,
  property_details_json TEXT,
  faqs_json TEXT,
  historical_messages TEXT,
  available_property_knowledge INTEGER DEFAULT 0,
  property_knowledge_category TEXT,
  faq_category TEXT,
  task_required INTEGER DEFAULT 0,
  task_bucket TEXT,
  task_request_title TEXT,
  urgency_indicators TEXT,
  escalation_risk_indicators TEXT,
  update_existing_task_id TEXT,
  ai_generated_response TEXT,
  ticket_enrichment_json TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (summary_id) REFERENCES summarized_logs(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- AI logs (from d:aiLog)
CREATE TABLE IF NOT EXISTS ai_logs (
  id TEXT PRIMARY KEY,
  recipient_type TEXT NOT NULL,
  property_id TEXT,
  booking_id TEXT,
  to_number TEXT,
  message_bundle_id TEXT,
  original_message TEXT,
  ticket_enrichment_json TEXT,
  urgency_indicators TEXT,
  escalation_risk_indicators TEXT,
  available_property_knowledge INTEGER DEFAULT 0,
  property_knowledge_category TEXT,
  task_required INTEGER DEFAULT 0,
  task_bucket TEXT,
  task_request_title TEXT,
  ai_message_response TEXT,
  status TEXT DEFAULT 'Pending',
  sent_status INTEGER DEFAULT 0,
  task_created INTEGER DEFAULT 0,
  task_id TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

-- Tasks (from aiTasks)
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  booking_id TEXT,
  phone TEXT,
  guest_message TEXT,
  action_title TEXT,
  task_bucket TEXT,
  sub_category TEXT,
  task_request_title TEXT,
  task_json TEXT,
  staff_id TEXT,
  staff_name TEXT,
  staff_phone TEXT,
  staff_details_json TEXT,
  staff_requirements TEXT,
  guest_requirements TEXT,
  host_escalation TEXT,
  action_holder TEXT DEFAULT 'Guest',
  action_holder_notified INTEGER DEFAULT 0,
  action_holder_missing_requirements TEXT,
  action_holder_phone TEXT,
  host_notified INTEGER DEFAULT 0,
  host_escalation_needed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'Waiting on Guest',
  ai_message_response TEXT,
  response_received INTEGER DEFAULT 0,
  completion_notified INTEGER DEFAULT 0,
  message_chain_ids TEXT,
  ongoing_conversation TEXT,
  priority TEXT DEFAULT 'medium',  -- low, medium, high, urgent
  scheduled_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (staff_id) REFERENCES staff(id)
);

-- Task archive (from d:taskLog)
CREATE TABLE IF NOT EXISTS task_archive (
  id TEXT PRIMARY KEY,
  property_id TEXT,
  booking_id TEXT,
  phone TEXT,
  guest_message TEXT,
  action_title TEXT,
  task_bucket TEXT,
  sub_category TEXT,
  task_json TEXT,
  staff_id TEXT,
  staff_name TEXT,
  status TEXT,
  host_escalated INTEGER DEFAULT 0,
  completed_at TIMESTAMP,
  archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  original_task_json TEXT
);

-- Debug AI logs (from d:debugAi)
CREATE TABLE IF NOT EXISTS debug_ai_logs (
  id SERIAL PRIMARY KEY,
  function_name TEXT,
  row_number INTEGER,
  task_id TEXT,
  phase TEXT,
  model TEXT,
  prompt_label TEXT,
  prompt TEXT,
  response TEXT,
  parsed_json TEXT,
  decision_action TEXT,
  flags_json TEXT,
  guest_requirements TEXT,
  staff_requirements TEXT,
  task_scope TEXT,
  thread_info TEXT,
  is_kickoff INTEGER DEFAULT 0,
  response_received INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes (PostgreSQL syntax)
CREATE INDEX IF NOT EXISTS idx_messages_booking ON messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_messages_property ON messages(property_id);
CREATE INDEX IF NOT EXISTS idx_messages_from ON messages(from_number);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

CREATE INDEX IF NOT EXISTS idx_tasks_property ON tasks(property_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_phone ON tasks(phone);

CREATE INDEX IF NOT EXISTS idx_bookings_property ON bookings(property_id);
CREATE INDEX IF NOT EXISTS idx_bookings_phone ON bookings(guest_phone);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_ai_logs_status ON ai_logs(status);
CREATE INDEX IF NOT EXISTS idx_ai_logs_recipient ON ai_logs(recipient_type);

CREATE INDEX IF NOT EXISTS idx_summarized_status ON summarized_logs(status);

-- ============================================================
-- SCHEDULED MESSAGES SYSTEM
-- ============================================================

-- Message Templates (reusable Twilio templates)
CREATE TABLE IF NOT EXISTS message_templates (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  name TEXT NOT NULL,                          -- "Welcome Message", "Pre-Arrival Info"
  content_sid TEXT,                            -- Twilio template ID (e.g., HX1234abc...)
  fallback_body TEXT,                          -- Fallback message if not using template
  variables_schema TEXT,                       -- JSON array: ["guest_name", "check_in_date"]
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id)
);

-- Schedule Rules (when to send which template)
CREATE TABLE IF NOT EXISTS message_schedule_rules (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  name TEXT NOT NULL,                          -- "Welcome on Booking", "3-Day Pre-Arrival"
  
  -- Trigger Configuration
  trigger_type TEXT NOT NULL,                  -- ON_BOOKING_CREATED, DAYS_BEFORE_CHECKIN, etc.
  trigger_offset_days INTEGER DEFAULT 0,       -- +3 = 3 days after, -3 = 3 days before
  trigger_time TIME DEFAULT '09:00:00',        -- Time of day to send (for date-based triggers)
  
  -- Conditions (optional)
  min_stay_nights INTEGER,                     -- Only send if booking >= X nights
  platform_filter TEXT,                        -- JSON array: ["Airbnb", "VRBO"]
  
  priority INTEGER DEFAULT 100,                -- Lower = higher priority
  is_active INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (template_id) REFERENCES message_templates(id)
);

-- Scheduled Messages Queue (pending/sent messages)
CREATE TABLE IF NOT EXISTS scheduled_messages (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL,
  property_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  
  -- Recipient
  to_number TEXT NOT NULL,
  guest_name TEXT,
  
  -- Scheduling
  scheduled_for TIMESTAMP NOT NULL,
  
  -- Status Tracking
  status TEXT DEFAULT 'pending',               -- pending, sent, failed, cancelled
  sent_at TIMESTAMP,
  message_sid TEXT,                            -- Twilio SID after sending
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Variables snapshot (frozen at queue time)
  variables_json TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (template_id) REFERENCES message_templates(id),
  FOREIGN KEY (rule_id) REFERENCES message_schedule_rules(id)
);

-- Unique constraint to prevent duplicate scheduled messages per booking+rule
CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduled_unique_booking_rule 
ON scheduled_messages(booking_id, rule_id);

-- Indexes for scheduled messages
CREATE INDEX IF NOT EXISTS idx_scheduled_status_time ON scheduled_messages(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_booking ON scheduled_messages(booking_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_property ON scheduled_messages(property_id);

-- Indexes for templates and rules
CREATE INDEX IF NOT EXISTS idx_templates_property ON message_templates(property_id);
CREATE INDEX IF NOT EXISTS idx_rules_property ON message_schedule_rules(property_id);
CREATE INDEX IF NOT EXISTS idx_rules_template ON message_schedule_rules(template_id);
