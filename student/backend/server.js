/**
 * Smart Food Wastage Analyser — API server.
 *
 * Student accounts, meal intentions, attendance, notifications and sessions are
 * persisted in SQLite (see db/schema.sql). Still not connected: the ESP32
 * fingerprint reader and the ML service — both are labelled as such in the UI.
 */

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
const apiRoutes = require('./routes/api');
const { db, dbPath } = require('./db');
const store = require('./store');
const pubsub = require('./db/pubsub');

const app = express();
const PORT = process.env.PORT || 5000;

// Parse configured FRONTEND_URL(s), supporting comma-separated values (e.g. "https://student.vercel.app,https://admin.vercel.app")
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

const server = http.createServer(app);
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

// Cross-service synchronization: listen for hardware_scans broadcasted by Mess Backend
pubsub.initListener(['hardware_scans'], (channel, payload) => {
  console.log(`[Student backend] Received PostgreSQL pubsub event on [${channel}]:`, payload?.studentId || payload);
  if (channel === 'hardware_scans') {
    io.emit('attendance:update', payload);
    if (typeof store.getLiveStats === 'function') {
      io.emit('dashboard:stats_changed', store.getLiveStats());
    }
  }
});

io.on('connection', (socket) => {
  console.log(`[socket] Client connected: ${socket.id}`);
  socket.on('disconnect', () => {
    console.log(`[socket] Client disconnected: ${socket.id}`);
  });
});

app.use(cors(corsOptions));
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    mode: 'demo',
    database: 'connected',
    databaseEngine: 'sqlite',
    mlService: 'not_connected',
    fingerprintHardware: 'connected',
    webSockets: 'enabled',
  });
});
/**
 * GET /api/hardware/status
 * Polled by ESP32 to check current mode ('verify' | 'enroll') and last captured ID.
 */
app.get('/api/hardware/status', (req, res) => {
  res.json(store.getHardwareStatus());
});

/**
 * POST /api/hardware/mode
 * Called by React Dashboard to toggle hardware mode ('verify' | 'enroll').
 */
app.post('/api/hardware/mode', (req, res) => {
  const { mode } = req.body || {};
  if (!mode || (mode !== 'verify' && mode !== 'enroll')) {
    return res.status(400).json({
      error: 'invalid_mode',
      message: "Mode must be either 'verify' or 'enroll'.",
    });
  }

  const updatedStatus = store.setHardwareMode(mode);
  io.emit('hardware:mode_changed', updatedStatus);

  return res.json({
    status: 'success',
    message: `Hardware mode set to ${mode}`,
    ...updatedStatus,
  });
});

/**
 * POST /api/hardware/captured
 * Hit by ESP32 when a new fingerprint template is stored in sensor memory.
 * Payload: { newFingerprintId: 4, deviceId?: "ESP32_GATE" }
 */
app.post('/api/hardware/captured', (req, res) => {
  const { newFingerprintId, deviceId } = req.body || {};
  if (newFingerprintId === undefined || newFingerprintId === null) {
    return res.status(400).json({
      error: 'missing_id',
      message: 'newFingerprintId is required.',
    });
  }

  const result = store.recordCapturedFingerprint(newFingerprintId);
  if (result.error) {
    return res.status(400).json(result);
  }

  const payload = {
    fingerprintId: result.fingerprintId,
    timestamp: new Date().toISOString(),
    deviceId: deviceId || 'ESP32_GATE',
  };

  // Broadcast WebSocket notification to frontend
  io.emit('hardware:fingerprint_captured', payload);

  return res.json({
    status: 'success',
    message: `New fingerprint ID ${result.fingerprintId} captured and ready to map.`,
    ...payload,
  });
});

/**
 * ESP32 Hardware Scan Bridge Endpoint:
 *   POST /api/hardware/scan  { fingerprintId, studentId, deviceId }
 *     -> records scan in SQLite via store.recordHardwareScan
 *     -> broadcasts 'attendance:update' and 'dashboard:stats_changed' over WebSocket
 */
app.post('/api/hardware/scan', (req, res) => {
  const { studentId, fingerprintId, deviceId } = req.body || {};
  if (studentId === undefined && fingerprintId === undefined) {
    return res.status(400).json({
      error: 'missing_identifier',
      message: 'Either fingerprintId or studentId is required.',
    });
  }

  const scanResult = store.recordHardwareScan({ studentId, fingerprintId, deviceId });
  const liveStats = store.getLiveStats();

  // Instant real-time broadcast to all connected web clients & dashboards
  io.emit('attendance:update', scanResult);
  io.emit('dashboard:stats_changed', liveStats);

  // Cross-service synchronization: notify Mess backend via PostgreSQL NOTIFY
  pubsub.notify('hardware_scans', scanResult);

  let statusCode = 200;
  if (scanResult.status === 'unregistered') statusCode = 404;
  else if (scanResult.status === 'error') statusCode = 400;

  return res.status(statusCode).json(scanResult);
});

/**
 * Hardware Fingerprint Enrollment Endpoint:
 *   POST /api/hardware/enroll  { studentId, name, fingerprintId }
 *     -> creates a new student profile and links fingerprint on the fly
 */
app.post('/api/hardware/enroll', (req, res) => {
  const { studentId, name, fingerprintId } = req.body || {};
  if (!studentId || !name || fingerprintId === undefined || fingerprintId === null) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'studentId, name, and fingerprintId are all required for enrollment.',
    });
  }

  const normalizedStudentId = String(studentId).trim().toUpperCase();
  const studentName = String(name).trim();
  const parsedFpId = parseInt(fingerprintId, 10);

  const nameRegex = /^[A-Za-z\s]+$/;
  const studentIdRegex = /^\d{2}[A-Za-z]{3}\d{4,5}$/;

  if (!nameRegex.test(studentName)) {
    return res.status(400).json({
      error: 'invalid_name',
      message: 'Name must only contain letters and spaces.',
    });
  }

  if (!studentIdRegex.test(normalizedStudentId)) {
    return res.status(400).json({
      error: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
      message: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
    });
  }

  if (isNaN(parsedFpId)) {
    return res.status(400).json({
      error: 'invalid_fingerprint_id',
      message: 'fingerprintId must be an integer.',
    });
  }

  // Check if the student already exists in the users table
  const checkUserStmt = db.prepare(`
    SELECT id, name, student_id, fingerprint_id FROM users
    WHERE upper(id) = ? OR upper(student_id) = ?
  `);
  const existingStudent = checkUserStmt.get(normalizedStudentId, normalizedStudentId);

  // If they do exist, DO NOT update their fingerprint_id. Instead, return a 400 JSON error response
  if (existingStudent) {
    return res.status(400).json({
      error: 'Student is already enrolled.',
    });
  }

  // Check if fingerprint ID is already assigned to another user
  const checkFpStmt = db.prepare('SELECT id, name, student_id FROM users WHERE fingerprint_id = ?');
  const existingFp = checkFpStmt.get(parsedFpId);
  if (existingFp) {
    return res.status(400).json({
      error: `Fingerprint ID ${parsedFpId} is already assigned to ${existingFp.name || existingFp.student_id}.`,
    });
  }

  // If they do not exist, execute an INSERT statement to create a new row
  const todayStr = store.toDateKey ? store.toDateKey(new Date()) : new Date().toISOString().slice(0, 10);
  const email = `${normalizedStudentId.toLowerCase()}@smartmess.demo`;

  const insertUserStmt = db.prepare(`
    INSERT INTO users (id, role, name, email, password_hash, student_id, fingerprint_id, hostel, mess_plan, joined_on)
    VALUES (?, 'student', ?, ?, '', ?, ?, 'General Hostel', 'Full Plan (3 meals)', ?)
  `);

  insertUserStmt.run(
    normalizedStudentId,
    studentName,
    email,
    normalizedStudentId,
    parsedFpId,
    todayStr
  );

  const newUser = store.getUserById(normalizedStudentId);

  return res.json({
    status: 'success',
    message: `Fingerprint ID ${parsedFpId} successfully assigned to ${studentName} (${normalizedStudentId}).`,
    user: newUser,
  });
});

app.all('/api/hardware/attendance', (req, res) => {
  res.status(308).json({
    message: 'Please use POST /api/hardware/scan for ESP32 fingerprint scans.',
  });
});

app.use('/api', apiRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[api error]', err);
  res.status(500).json({ error: 'server_error', message: 'Something went wrong on the server.' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Smart Food Wastage Analyser API + Socket.io -> http://localhost:${PORT} (0.0.0.0:${PORT})`);
  console.log(`  database: ${dbPath}`);
  const missingGmailVars = ['GMAIL_CLIENT_ID', 'GMAIL_CLIENT_SECRET', 'GMAIL_REFRESH_TOKEN'].filter(
    (key) => !process.env[key]
  );
  if (missingGmailVars.length > 0) {
    console.warn(`[WARNING] Missing Google OAuth variables for OTP sending: ${missingGmailVars.join(', ')}`);
  }
});
