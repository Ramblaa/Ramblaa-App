# Ramble Backend Server

Node.js/Express backend for the Ramble AI-powered guest communication platform.

## Quick Start

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment

Copy the sample environment file and fill in your values:

```bash
cp env.sample .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `OPENAI_API_KEY` | Your OpenAI API key |
| `TWILIO_ACCOUNT_SID` | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Twilio Auth Token |
| `TWILIO_WHATSAPP_NUMBER` | Your Twilio WhatsApp number (format: `whatsapp:+14155238886`) |

### 3. Run the Server

**Development:**
```bash
npm run dev
```

**Production:**
```bash
npm start
```

The server will start on `http://localhost:3001` by default.

## API Endpoints

### Webhook
- `POST /api/webhook/twilio` - Receive inbound WhatsApp messages from Twilio

### Messages
- `GET /api/messages` - List all conversations
- `GET /api/messages/:phone` - Get conversation by phone number
- `POST /api/messages/send` - Send a message

### Tasks
- `GET /api/tasks` - List all tasks
- `GET /api/tasks/:id` - Get task details
- `POST /api/tasks` - Create a task
- `PATCH /api/tasks/:id` - Update a task
- `DELETE /api/tasks/:id` - Delete a task
- `POST /api/tasks/:id/complete` - Mark task complete
- `POST /api/tasks/process` - Trigger task workflow processing
- `POST /api/tasks/evaluate` - Evaluate task statuses
- `POST /api/tasks/archive` - Archive completed tasks

### Properties
- `GET /api/properties` - List all properties
- `GET /api/properties/:id` - Get property details
- `POST /api/properties` - Create a property
- `GET /api/properties/:id/bookings` - Get property bookings
- `POST /api/properties/:id/bookings` - Create a booking
- `GET /api/properties/:id/faqs` - Get property FAQs
- `POST /api/properties/:id/faqs` - Create an FAQ
- `GET /api/properties/:id/staff` - Get property staff
- `POST /api/properties/:id/staff` - Create a staff member

## Architecture

### Key Changes from Google Apps Script

1. **No Message Consolidation** - Each intent/action is sent as an individual WhatsApp message immediately, rather than being grouped by phone number.

2. **SQLite Database** - Data is stored in a local SQLite database instead of Google Sheets.

3. **Real-time Processing** - Messages are processed through the AI pipeline immediately upon receipt.

### File Structure

```
server/
├── index.js                 # Entry point
├── config/
│   └── env.js              # Environment configuration
├── routes/
│   ├── webhook.js          # Twilio webhook endpoints
│   ├── messages.js         # Message API
│   ├── tasks.js            # Task API
│   └── properties.js       # Property/booking API
├── services/
│   ├── openai.js           # OpenAI integration
│   ├── twilio.js           # Twilio WhatsApp sending
│   ├── messageProcessor.js # Core AI pipeline
│   └── taskManager.js      # Task workflow
├── prompts/
│   └── index.js            # All prompt templates
├── utils/
│   ├── templateFiller.js   # Template variable replacement
│   └── phoneUtils.js       # Phone normalization
└── db/
    ├── schema.sql          # Database schema
    └── index.js            # Database connection
```

## Twilio Configuration

To receive WhatsApp messages, configure your Twilio WhatsApp sandbox or number to send webhooks to:

```
POST https://your-domain.com/api/webhook/twilio
```

The server will:
1. Parse the inbound message
2. Identify the sender (Guest/Staff/Host)
3. Log the message to the database
4. Process through the AI pipeline (for Guest messages)
5. Send individual response messages per intent/action

## Database

The server uses SQLite by default. The database file is created at the path specified by `DATABASE_URL` (default: `./data/ramble.db`).

### Tables

- `properties` - Property information
- `staff` - Staff directory
- `bookings` - Guest bookings
- `faqs` - Property FAQs
- `task_definitions` - Task templates
- `messages` - Message log
- `summarized_logs` - AI summarizations
- `ai_responses` - AI response records
- `ai_logs` - AI processing logs
- `tasks` - Active tasks
- `task_archive` - Completed tasks

# Trigger redeploy - Wed Dec  3 17:24:28 WITA 2025
