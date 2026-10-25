require('dotenv').config();

const missingGmailOAuthVars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter(
  (key) => !process.env[key]
);
if (missingGmailOAuthVars.length > 0) {
  console.warn(
    `[WARNING] Missing Google OAuth environment variable(s): ${missingGmailOAuthVars.join(', ')}. ` +
      'Gmail HTTP API OTP delivery over port 443 will not function until these are configured.'
  );
}
const http = require('http');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');
const { db, dbPath } = require('./db');
const store = require('./store');
const apiRoutes = require('./routes/api');
const { initMealSyncCron } = require('./cron/mealSyncCron');

const app = express();
const PORT = process.env.PORT || 5002;

// Parse configured FRONTEND_URL(s), supporting comma-separated values (e.g. "https://mess.vercel.app,https://student.vercel.app")
const rawFrontendUrls = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((url) => url.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...rawFrontendUrls,
];

function isOriginAllowed(origin) {
  // Allow requests with no origin (e.g. mobile apps, curl, server-to-server)
  if (!origin) return true;

  // Explicit allowed list (localhost ports + FRONTEND_URL)
  if (allowedOrigins.includes(origin)) return true;

  // Local development on any port (localhost / 127.0.0.1)
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;

  // Future Vercel deployment preview and production domains (*.vercel.app)
  if (/^https:\/\/[a-zA-Z0-9_.-]+\.vercel\.app$/.test(origin)) return true;

  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(null, true);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
};

// Explicit HTTP server creation
const server = http.createServer(app);

// Socket.io initialization supporting FRONTEND_URL and Vercel domains
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (isOriginAllowed(origin)) {
        return callback(null, true);
      }
      return callback(null, true);
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log(`[mess socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[mess socket] Client disconnected: ${socket.id}`);
  });
});

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api', apiRoutes);

// Server listen call (strictly using server.listen, not app.listen)
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mess Admin Backend + Socket.io running on port ${PORT} (0.0.0.0:${PORT})`);
  console.log(`  database: ${dbPath}`);
  const missingGmailVars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter(
    (key) => !process.env[key]
  );
  if (missingGmailVars.length > 0) {
    console.warn(`[WARNING] Missing Google OAuth variables for OTP sending: ${missingGmailVars.join(', ')}`);
  }
  // Initialize automated post-meal ML sync cron jobs
  initMealSyncCron(io);
});
