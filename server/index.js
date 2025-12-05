import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { config } from './config/env.js';
import { initDatabase } from './db/index.js';

// Import routes
import authRoutes from './routes/auth.js';
import usersRoutes from './routes/users.js';
import webhookRoutes from './routes/webhook.js';
import messagesRoutes from './routes/messages.js';
import tasksRoutes from './routes/tasks.js';
import propertiesRoutes from './routes/properties.js';
import scheduledRoutes from './routes/scheduled.js';

// Import scheduled message services
import { processPendingScheduledMessages } from './services/scheduledMessageProcessor.js';
import { evaluateDateBasedRules } from './services/scheduleService.js';

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration - allow all Railway origins and localhost
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) {
      return callback(null, true);
    }
    
    // Allow all railway.app origins and localhost
    if (origin.includes('.railway.app') || 
        origin.includes('localhost') || 
        origin.includes('127.0.0.1')) {
      console.log('[CORS] Allowed origin:', origin);
      return callback(null, origin); // Return the actual origin
    }
    
    // Allow configured CORS origin
    if (config.server.corsOrigin && origin === config.server.corsOrigin) {
      return callback(null, origin);
    }
    
    console.warn('[CORS] Blocked origin:', origin);
    return callback(null, origin); // Allow all for now during development
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
  optionsSuccessStatus: 200
}));

// Handle preflight requests explicitly
app.options('*', (req, res) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Origin, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs for auth
  message: 'Too many authentication attempts, please try again later.'
});

// Webhook rate limiting
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 requests per minute for webhooks
  message: 'Too many webhook requests, please try again later.'
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/webhook', webhookLimiter, webhookRoutes);
app.use('/api/messages', messagesRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/properties', propertiesRoutes);
app.use('/api/scheduled', scheduledRoutes);

// Error handler
app.use((err, req, res, next) => {
  console.error('[Error]', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Build version for deployment verification
const BUILD_VERSION = '2024-12-05-v1-scheduled-messages';
const BUILD_TIMESTAMP = new Date().toISOString();

// Version endpoint for deployment verification
app.get('/api/version', (req, res) => {
  res.json({
    version: BUILD_VERSION,
    buildTime: BUILD_TIMESTAMP,
    uptime: process.uptime(),
    nodeVersion: process.version,
  });
});

// Config endpoint for environment verification (no secrets exposed)
app.get('/api/config', (req, res) => {
  res.json({
    environment: process.env.NODE_ENV || 'development',
    twilioNumber: config.twilio.whatsappNumber || 'NOT_CONFIGURED',
    twilioConfigured: !!(config.twilio.accountSid && config.twilio.authToken),
    openaiConfigured: !!config.openai.apiKey,
    databaseConfigured: !!config.database.url,
    version: BUILD_VERSION,
  });
});

// Initialize database and start server
async function start() {
  try {
    await initDatabase();
    console.log('[DB] Database initialized');

    // ============================================================
    // SCHEDULED MESSAGES CRON JOBS
    // ============================================================
    
    // Process pending scheduled messages every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      console.log('[Cron] Processing pending scheduled messages...');
      try {
        const result = await processPendingScheduledMessages();
        if (result.processed > 0) {
          console.log(`[Cron] Processed ${result.sent} sent, ${result.failed} failed`);
        }
      } catch (error) {
        console.error('[Cron] Error processing scheduled messages:', error.message);
      }
    });
    console.log('[Cron] Scheduled message processor registered (every 5 minutes)');

    // Daily evaluation of date-based rules at midnight
    cron.schedule('0 0 * * *', async () => {
      console.log('[Cron] Running daily date-based rules evaluation...');
      try {
        const result = await evaluateDateBasedRules();
        console.log(`[Cron] Evaluated ${result.bookingsChecked} bookings, queued ${result.messagesQueued} messages`);
      } catch (error) {
        console.error('[Cron] Error in daily evaluation:', error.message);
      }
    });
    console.log('[Cron] Daily rules evaluator registered (midnight)');

    // Railway provides PORT env var - use it directly
    const port = process.env.PORT || 3001;
    const host = '0.0.0.0';
    console.log(`[Server] PORT env var: ${process.env.PORT}`);
    
    app.listen(port, host, () => {
      console.log('========================================');
      console.log(`[Server] VERSION: ${BUILD_VERSION}`);
      console.log(`[Server] BUILD TIME: ${BUILD_TIMESTAMP}`);
      console.log('========================================');
      console.log('[Config] Environment:', process.env.NODE_ENV || 'development');
      console.log('[Config] Twilio WhatsApp Number:', config.twilio.whatsappNumber || '⚠️ NOT SET');
      console.log('[Config] Twilio Account:', config.twilio.accountSid ? `${config.twilio.accountSid.slice(0, 8)}...` : '⚠️ NOT SET');
      console.log('[Config] OpenAI:', config.openai.apiKey ? '✓ Configured' : '⚠️ NOT SET');
      console.log('[Config] Database:', config.database.url ? '✓ Configured' : '⚠️ NOT SET');
      console.log('========================================');
      console.log(`[Server] Running on ${host}:${port}`);
      console.log(`[Server] Environment: ${config.server.nodeEnv}`);
      console.log(`[Server] CORS origin: ${config.server.corsOrigin}`);
      console.log(`[Server] Scheduled message cron jobs: ACTIVE`);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();

