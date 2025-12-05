# Ramble

An AI-powered guest communication platform for short-term rental property managers. Ramble automates guest messaging via WhatsApp using "Rambley AI" while providing a comprehensive dashboard for managing properties, bookings, tasks, and staff.

## Features

- **Guest Messaging** - WhatsApp conversations with guests via Twilio, auto-response toggle per conversation, conversation threading by booking
- **AI Assistant (Rambley)** - Context-aware automated responses powered by OpenAI, uses FAQs, property info, and booking details to provide accurate answers
- **Task Management** - AI-flagged tasks for cleaning, maintenance, inspections; status workflow with staff assignment and archiving
- **Property Management** - Multi-property support with bookings, check-in/out details, WiFi info, and house rules
- **Staff Directory** - Contact management organized by service type (cleaning, maintenance, etc.)
- **Knowledge Base** - FAQs and resources that inform AI responses for each property
- **Sandbox Mode** - Safe testing environment for AI responses with scenario setup and persona switching
- **Escalations** - Track and resolve escalated guest issues requiring human attention

## How It Works

### Message Flow Overview

```
Guest sends WhatsApp message
            ↓
    Twilio Webhook receives message
            ↓
    Message Processor (OpenAI)
    - Summarizes guest intents
    - Checks FAQs & property context
    - Generates response(s)
            ↓
    WhatsApp response sent via Twilio
            ↓
    [If task required] → Task created → Staff notified
```

### Detailed Message Flow

#### 1. User Sends Message (Frontend)
- `src/pages/MessagesPage.jsx` - Chat UI where hosts type messages
- `src/lib/api.js` - API client sends `POST /api/messages/send`

#### 2. Backend Processes Outbound Message
- `server/routes/messages.js` - Route handler receives request
- `server/services/twilio.js` - Sends WhatsApp via Twilio SDK, logs to `messages` table

#### 3. Guest Replies (Inbound Flow)
- Twilio webhook hits `POST /api/webhook/twilio`
- `server/routes/webhook.js` - Stores message, triggers async AI processing

#### 4. AI Processing Pipeline
- `server/services/messageProcessor.js` - Main orchestrator
  - **Summarization**: Extracts "action titles" from guest message
  - **Enrichment**: For each action, calls OpenAI to determine if property knowledge can answer, if a task is required, and generates an AI response
- `server/services/openai.js` - OpenAI API integration (GPT-4o-mini)
- `server/prompts/index.js` - AI prompt templates

#### 5. AI Response Sent to Guest
- `server/services/twilio.js` - Sends AI-generated response via WhatsApp
- Stored in `ai_logs` table with enrichment data

#### 6. Task Creation (If Needed)
- `server/services/taskManager.js` - Creates tasks from AI logs, assigns to staff, notifies via WhatsApp

### Key Files Summary

| Layer | File | Purpose |
|-------|------|---------|
| **Frontend UI** | `src/pages/MessagesPage.jsx` | Chat interface |
| **API Client** | `src/lib/api.js` | HTTP requests to backend |
| **Message Routes** | `server/routes/messages.js` | REST endpoints for messages |
| **Webhook** | `server/routes/webhook.js` | Receives inbound WhatsApp |
| **AI Processing** | `server/services/messageProcessor.js` | Summarization & enrichment |
| **OpenAI** | `server/services/openai.js` | GPT-4o-mini integration |
| **Twilio** | `server/services/twilio.js` | WhatsApp sending/logging |
| **Prompts** | `server/prompts/index.js` | AI prompt templates |
| **Config** | `server/config/env.js` | API keys, database URL |
| **Schema** | `server/db/schema.sql` | Database tables |

### Database Tables

| Table | Purpose |
|-------|---------|
| `messages` | All inbound/outbound WhatsApp messages |
| `ai_logs` | AI enrichment results, task requirements |
| `tasks` | Created tasks with status/assignment |
| `bookings` | Guest booking info |
| `properties` | Property details, FAQs |
| `staff` | Staff directory with contact info |

### Architectural Notes

- **Booking-Scoped History**: Each booking gets its own conversation context (new booking = fresh start)
- **Async AI Processing**: Webhook returns immediately; AI runs in background
- **UUID Tracking**: Every message, AI enrichment, and task has a UUID for full audit trail

## Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19 + Vite + Tailwind CSS + Framer Motion |
| Backend | Node.js + Express |
| Database | PostgreSQL (Railway) |
| AI | OpenAI API (GPT-4o-mini) |
| Messaging | Twilio WhatsApp API |
| Auth | JWT with refresh tokens |
| Deployment | Railway |

### Directory Structure

```
ramblaa-app/
├── frontend/               # React frontend
│   └── src/
│       ├── pages/          # Page components (Messages, Tasks, Properties, etc.)
│       ├── components/     # Reusable UI components
│       ├── contexts/       # Auth & notification state
│       ├── services/       # API clients
│       ├── hooks/          # Custom React hooks
│       └── lib/            # Utilities
│
├── server/                 # Express backend
│   ├── routes/             # API endpoints
│   ├── services/           # Business logic (OpenAI, Twilio, message processing)
│   ├── middleware/         # Auth, error handling
│   ├── db/                 # Database schema and connection
│   ├── config/             # Environment configuration
│   └── scripts/            # Database seeding scripts
│
└── docs/                   # Additional documentation
    ├── WEBHOOK-SETUP.md
    ├── RAILWAY-DEPLOYMENT.md
    └── GIT-WORKFLOW.md
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Railway account)
- Twilio account with WhatsApp sandbox
- OpenAI API key

### Backend Setup

```bash
cd server
npm install
cp env.sample .env
# Edit .env with your credentials (see Environment Variables below)
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
cp .env.example .env
# Set VITE_API_URL to your backend URL
npm run dev
```

### Database Setup

The database schema is in `server/db/schema.sql`. Run migrations or seed data:

```bash
cd server
npm run seed        # Seed sample data
npm run seed-admin  # Create admin user only
```

**Default Admin Account:**
- Email: `admin@rambley.com`
- Password: `AdminPass123!`
- **Change this password after first login!**

## Environment Variables

Create a `.env` file in the `/server` directory:

```env
# OpenAI
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL=gpt-4o-mini

# Twilio
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886

# Database (PostgreSQL - Railway provides this automatically)
DATABASE_URL=postgresql://user:password@host:5432/database

# Server
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:5174

# JWT Authentication
JWT_SECRET=your-jwt-secret-minimum-32-chars
JWT_REFRESH_SECRET=your-refresh-secret-minimum-32-chars

# External Webhook (optional)
WEBHOOK_URL=
WEBHOOK_API_KEY=
ACCOUNT_ID=1
```

## API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/signup` | Public user registration |
| POST | `/api/auth/register` | Admin-only user creation |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/me` | Get current user |

### Messages
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/messages` | List all conversations |
| GET | `/api/messages/:id` | Get conversation history |
| POST | `/api/messages/send` | Send manual message |

### Tasks
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List tasks (with filters) |
| GET | `/api/tasks/:id` | Get task details |
| POST | `/api/tasks` | Create new task |
| PATCH | `/api/tasks/:id` | Update task |
| POST | `/api/tasks/:id/assign` | Assign staff to task |
| POST | `/api/tasks/:id/complete` | Mark task completed |

### Properties
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/properties` | List all properties |
| GET | `/api/properties/:id` | Get property details |

### Webhooks
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhook/twilio` | Receive WhatsApp messages |
| GET | `/api/webhook/health` | Webhook health check |

## Railway Deployment

### Backend Deployment

1. Create a new Railway service for the backend
2. Add PostgreSQL database to your Railway project
3. Set environment variables in Railway dashboard:
   ```
   OPENAI_API_KEY=your-key
   TWILIO_ACCOUNT_SID=your-sid
   TWILIO_AUTH_TOKEN=your-token
   TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
   JWT_SECRET=your-strong-secret-key
   JWT_REFRESH_SECRET=your-strong-refresh-secret
   CORS_ORIGIN=https://your-frontend-domain.railway.app
   NODE_ENV=production
   ```
4. Deploy by connecting your repository and selecting the `server` folder

### Frontend Deployment

1. Set environment variables in Railway:
   ```
   VITE_API_URL=https://your-backend-api.railway.app/api
   ```
2. Deploy using your existing Railway configuration

### Twilio Webhook Configuration

Configure your Twilio WhatsApp sandbox to point to:
```
https://your-backend-api.railway.app/api/webhook/twilio
```

See `WEBHOOK-SETUP.md` for detailed instructions.

## Security

### Features
- JWT authentication with short-lived access tokens (15min) and refresh tokens (7 days)
- Rate limiting on all endpoints (stricter on auth/webhook routes)
- CORS protection
- Helmet.js security headers
- Password complexity requirements (8+ chars, letter, number, special char)
- SQL injection protection with parameterized queries
- Bcrypt password hashing (12 salt rounds)

### Recommendations
1. **Change default admin password** immediately after deployment
2. **Use strong JWT secrets** (generate with `openssl rand -base64 32`)
3. **Keep dependencies updated** with `npm audit`
4. **Monitor failed login attempts** in application logs
5. **Use HTTPS** in production (Railway provides this automatically)

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "Session expired" errors | Clear localStorage and login again |
| CORS errors | Check `CORS_ORIGIN` environment variable matches frontend URL |
| Database connection issues | Verify `DATABASE_URL` in Railway |
| Token refresh failures | Ensure JWT secrets match between deployments |
| WhatsApp messages not received | Check Twilio webhook URL and credentials |
| AI responses failing | Verify `OPENAI_API_KEY` is valid |

### Logs

- **Backend logs**: Check Railway backend service logs
- **Frontend logs**: Check browser console and Railway frontend logs
- **Database logs**: Check Railway PostgreSQL logs

## Development

```bash
# Run backend in development mode (auto-reload)
cd server && npm run dev

# Run frontend in development mode
cd frontend && npm run dev

# Build frontend for production
cd frontend && npm run build
```

---

Built with React, Node.js, OpenAI, and Twilio. Deployed on Railway.
