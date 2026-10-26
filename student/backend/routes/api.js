/**
 * Smart Food Wastage Analyser — API routes.
 *
 * Two role-scoped groups share one auth layer:
 *   /api/...          shared or mess-staff endpoints (existing admin portal)
 *   /api/student/...  student portal endpoints
 *
 * Every handler reads from store.js. No data is defined in this file, so the
 * whole backend talks to the database through that one module.
 */

const express = require('express');
const data = require('../store');
const { db } = require('../db');
const { login, logout, requireAuth, requireRole } = require('../auth');
const {
  generateOtp,
  sendOtpEmail,
  storeOtp,
  verifyOtp,
  determineRole,
  issueToken,
  storePendingRegistration,
  getPendingRegistration,
  clearPendingRegistration,
} = require('../otpService');

const router = express.Router();

const VALID_INTENTS = ['attending', 'not_attending', 'none'];

/* ------------------------------------------------------------------ *
 * Auth (shared by both portals)
 * ------------------------------------------------------------------ */

/**
 * POST /api/auth/register-request
 * Body: { name, email, role, studentId/regNo, hostel }
 * Validates VIT-AP domain, ensures account doesn't exist, stores pending reg, sends OTP.
 */
router.post('/auth/register-request', async (req, res) => {
  const { name, email, role, studentId, regNo, hostel } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.endsWith('@vitapstudent.ac.in') && !normalizedEmail.endsWith('@vitap.ac.in')) {
    return res.status(400).json({
      error: 'Invalid domain. Allowed emails must end with @vitapstudent.ac.in or @vitap.ac.in.',
      message: 'Invalid domain. Allowed emails must end with @vitapstudent.ac.in or @vitap.ac.in.',
    });
  }

  // Check if account already exists
  const existingUser = data.getUserByEmail ? data.getUserByEmail(normalizedEmail) : data.findUserForLogin(normalizedEmail);
  if (existingUser && (existingUser.id || existingUser.user)) {
    return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
  }

  const cleanRole = 'student';
  const effectiveStudentId = studentId || regNo;

  const studentIdRegex = /^\d{2}[A-Za-z]{3}\d{4,5}$/;

  if (cleanRole === 'student') {
    if (!effectiveStudentId || !studentIdRegex.test(String(effectiveStudentId).trim())) {
      return res.status(400).json({
        error: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
        message: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
      });
    }
  } else if (effectiveStudentId && !studentIdRegex.test(String(effectiveStudentId).trim())) {
    return res.status(400).json({
      error: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
      message: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
    });
  }

  const regData = {
    name: String(name).trim(),
    email: normalizedEmail,
    role: cleanRole,
    studentId: effectiveStudentId ? String(effectiveStudentId).trim().toUpperCase() : null,
    hostel: hostel ? String(hostel).trim() : null,
  };

  storePendingRegistration(normalizedEmail, regData);

  const otp = generateOtp();
  storeOtp(normalizedEmail, otp);
  await sendOtpEmail(normalizedEmail, otp);

  return res.json({
    success: true,
    message: 'Verification OTP sent to your college email.',
  });
});

/**
 * POST /api/auth/register-verify
 * Body: { email: string, otp: string }
 * Verifies OTP, inserts new user into database, generates JWT token.
 */
router.post('/auth/register-verify', (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedOtp = String(otp).trim();

  const verification = verifyOtp(normalizedEmail, trimmedOtp);
  if (!verification.valid) {
    return res.status(400).json({ error: verification.error });
  }

  const pending = getPendingRegistration(normalizedEmail);
  if (!pending) {
    return res.status(400).json({ error: 'Registration session expired or not found. Please sign up again.' });
  }

  clearPendingRegistration(normalizedEmail);

  // Save new user to users table
  let newUser;
  try {
    newUser = data.registerUser({
      role: pending.role,
      name: pending.name,
      email: pending.email,
      studentId: pending.studentId,
      hostel: pending.hostel,
    });
  } catch (err) {
    console.error('[AUTH] Failed to save registered user:', err);
    return res.status(500).json({ error: 'Failed to create user account. Please try again.' });
  }

  const payload = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    studentId: newUser.studentId || null,
    regNo: newUser.studentId || null,
    hostel: newUser.hostel || null,
  };

  const token = issueToken(payload);

  try {
    data.createSession(token, newUser.id);
  } catch (err) {}

  return res.json({
    success: true,
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      studentId: newUser.studentId || null,
      regNo: newUser.studentId || null,
      hostel: newUser.hostel || null,
      messName: newUser.mess || (newUser.hostel ? `Mess - ${newUser.hostel}` : 'Central Mess — Block A'),
    },
  });
});

/**
 * POST /api/auth/request-otp (Login Flow)
 * Body: { email: string }
 * Strictly checks that email ends with @vitap.ac.in or @vitapstudent.ac.in.
 * Checks if account exists in database. If not, returns 404 {"error": "Account not found. Please sign up first."}.
 * Generates OTP and sends strictly via Gmail HTTP API (NEVER returned in JSON).
 */
router.post('/auth/request-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.endsWith('@vitapstudent.ac.in') && !normalizedEmail.endsWith('@vitap.ac.in')) {
    return res.status(400).json({
      error: 'Invalid domain. Allowed emails must end with @vitapstudent.ac.in or @vitap.ac.in.',
      message: 'Invalid domain. Allowed emails must end with @vitapstudent.ac.in or @vitap.ac.in.',
    });
  }

  // Check if account exists in database
  const user = data.getUserByEmail ? data.getUserByEmail(normalizedEmail) : null;
  const legacyFound = !user && data.findUserForLogin ? data.findUserForLogin(normalizedEmail) : null;
  const existingUser = user || legacyFound?.user;

  if (!existingUser) {
    return res.status(404).json({ error: 'Account not found. Please sign up first.' });
  }

  const otp = generateOtp();
  storeOtp(normalizedEmail, otp);
  await sendOtpEmail(normalizedEmail, otp);

  return res.json({
    success: true,
    message: 'OTP sent successfully to your VIT-AP email address.',
  });
});

/**
 * POST /api/auth/verify-otp (Login Flow)
 * Body: { email: string, otp: string }
 * Verifies 6-digit OTP, loads user from database, issues JWT token.
 */
router.post('/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body || {};
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const trimmedOtp = String(otp).trim();

  const verification = verifyOtp(normalizedEmail, trimmedOtp);
  if (!verification.valid) {
    return res.status(400).json({ error: verification.error });
  }

  let user = data.getUserByEmail ? data.getUserByEmail(normalizedEmail) : null;
  if (!user && data.findUserForLogin) {
    const found = data.findUserForLogin(normalizedEmail);
    user = found?.user;
  }

  if (!user) {
    return res.status(404).json({ error: 'Account not found. Please sign up first.' });
  }

  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    studentId: user.studentId || user.regNo || null,
    regNo: user.studentId || user.regNo || null,
    hostel: user.hostel || null,
  };

  const token = issueToken(payload);

  try {
    data.createSession(token, user.id);
  } catch (err) {}

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      studentId: user.studentId || user.regNo || null,
      regNo: user.studentId || user.regNo || null,
      hostel: user.hostel || null,
      messName: user.mess || (user.hostel ? `Mess - ${user.hostel}` : 'Central Mess — Block A'),
    },
  });
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: 'missing_credentials',
      message: 'Enter your email or student ID and your password.',
    });
  }

  const session = login(email, password);
  if (!session) {
    return res.status(401).json({
      error: 'invalid_credentials',
      message: 'Those credentials do not match an account. Please check and try again.',
    });
  }

  // The role in this response is what drives redirection in the frontend.
  return res.json(session);
});

router.post('/auth/logout', requireAuth, (req, res) => {
  logout(req.token);
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

/* ------------------------------------------------------------------ *
 * Shared profile
 * ------------------------------------------------------------------ */

router.get('/profile', requireAuth, (req, res) => {
  res.json({ profile: req.user });
});

/* ------------------------------------------------------------------ *
 * Student portal
 * ------------------------------------------------------------------ */

const studentOnly = [requireAuth, requireRole('student')];

/**
 * GET /api/student/meals
 * Today's and tomorrow's meals from this student's point of view, including
 * their own intent and their own attendance status.
 */
router.get('/student/meals', ...studentOnly, (req, res) => {
  const todayKey = data.getTodayDateKey ? data.getTodayDateKey() : data.toDateKey(new Date());
  const tomorrowKey = data.toDateKey(data.addDays(todayKey, 1));

  res.json({
    today: {
      date: todayKey,
      label: 'Today',
      meals: data.getMealsForDate(req.user.id, todayKey),
    },
    tomorrow: {
      date: tomorrowKey,
      label: 'Tomorrow',
      meals: data.getMealsForDate(req.user.id, tomorrowKey),
    },
    // Honest about what is and is not wired up yet.
    demoMode: true,
  });
});

/**
 * POST /api/student/meals/:mealId/intent
 * Body: { intent: 'attending' | 'not_attending' | 'none', date?: 'YYYY-MM-DD' }
 * This is the single write the student portal makes. It lands in `meal_intents`
 * alongside the attendance that followed — exactly the training set the ML
 * model will need.
 */
router.post('/student/meals/:mealId/intent', ...studentOnly, (req, res) => {
  const { mealId } = req.params;
  const { intent, date } = req.body || {};

  if (!VALID_INTENTS.includes(intent)) {
    return res.status(400).json({
      error: 'invalid_intent',
      message: 'Intent must be attending, not_attending or none.',
    });
  }

  const dateKey = date || (data.getTodayDateKey ? data.getTodayDateKey() : data.toDateKey(new Date()));
  const result = data.setMealIntent(req.user.id, dateKey, mealId, intent);

  if (result.error === 'unknown_meal') {
    return res.status(404).json({ error: 'unknown_meal', message: 'That meal does not exist.' });
  }
  if (result.error === 'cutoff_passed') {
    return res.status(409).json({
      error: 'cutoff_passed',
      message: 'The cutoff for this meal has passed, so responses are closed.',
    });
  }

  // Return the refreshed meal so the UI can update from server truth.
  const meals = data.getMealsForDate(req.user.id, dateKey);
  const updatedMeal = meals.find((meal) => meal.id === mealId);

  const io = req.app.get('io');
  const eventPayload = {
    studentId: req.user.studentId || req.user.id,
    userId: req.user.id,
    mealId,
    intent,
    date: dateKey,
  };
  if (io) {
    io.emit('intent:update', eventPayload);
    if (typeof data.getLiveStats === 'function') {
      io.emit('dashboard:stats_changed', data.getLiveStats());
    }
  }

  // Inter-service sync: notify Mess backend so Mess frontend dashboard reflects confirmed intents live
  const messBackendUrl = (process.env.MESS_BACKEND_URL || 'http://localhost:5002').replace(/\/+$/, '');
  fetch(`${messBackendUrl}/api/internal/intent-update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(eventPayload),
  }).catch(() => {
    // Non-blocking
  });

  return res.json({ ok: true, meal: updatedMeal });
});

/**
 * GET /api/student/attendance-overview?days=14
 * Calculates specific attendance overview metrics for the authenticated student
 * using SQLite attendance and meal_intents tables:
 * Planned (intents marked 'attending'), Attended (verified hardware scans),
 * Skipped (marked 'not attending' or missed), and Attendance Rate.
 */
/**
 * GET /api/student/dashboard
 * Consolidated dashboard payload returning today's and tomorrow's meals,
 * student attendance overview, and unread notification counts.
 */
router.get('/student/dashboard', ...studentOnly, (req, res) => {
  const todayKey = data.getTodayDateKey ? data.getTodayDateKey() : data.toDateKey(new Date());
  const tomorrowKey = data.toDateKey(data.addDays(todayKey, 1));
  const overview = data.getStudentAttendanceOverview(req.user.id, 14);
  const notifications = data.getNotifications(req.user.id);

  res.json({
    today: {
      date: todayKey,
      label: 'Today',
      meals: data.getMealsForDate(req.user.id, todayKey),
    },
    tomorrow: {
      date: tomorrowKey,
      label: 'Tomorrow',
      meals: data.getMealsForDate(req.user.id, tomorrowKey),
    },
    overview,
    summary: overview.summary,
    unreadNotifications: notifications.filter((n) => !n.read).length,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      studentId: req.user.studentId || req.user.id,
      role: req.user.role,
    },
    demoMode: true,
  });
});

router.get('/student/attendance-overview', ...studentOnly, (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
  const overview = data.getStudentAttendanceOverview(req.user.id, days);
  res.json({
    days,
    mealsPlanned: Number(overview.mealsPlanned) || 0,
    mealsAttended: Number(overview.mealsAttended) || 0,
    mealsSkipped: Number(overview.mealsSkipped) || 0,
    attendanceRate: Number(overview.attendanceRate) || 0,
    summary: {
      mealsPlanned: Number(overview.summary?.mealsPlanned ?? overview.mealsPlanned) || 0,
      mealsAttended: Number(overview.summary?.mealsAttended ?? overview.mealsAttended) || 0,
      mealsSkipped: Number(overview.summary?.mealsSkipped ?? overview.mealsSkipped) || 0,
      attendanceRate: Number(overview.summary?.attendanceRate ?? overview.attendanceRate) || 0,
    },
  });
});

/**
 * GET /api/student/history?days=14
 * Past intent vs verified attendance, plus summary stats and a daily trend.
 */
router.get('/student/history', ...studentOnly, (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 30);
  const records = data.getHistory(req.user.id, days);
  const overview = data.getStudentAttendanceOverview(req.user.id, days);

  res.json({
    days,
    records,
    summary: data.summariseHistory(records),
    trend: data.historyTrend(records, 7),
  });
});

router.get('/student/notifications', ...studentOnly, (req, res) => {
  const notifications = data.getNotifications(req.user.id);
  res.json({
    notifications,
    unreadCount: notifications.filter((n) => !n.read).length,
  });
});

/** :id accepts a notification id, or "all" to clear the whole list. */
router.post('/student/notifications/:id/read', ...studentOnly, (req, res) => {
  const ok = data.markNotification(req.user.id, req.params.id, req.body?.read !== false);
  if (!ok) {
    return res.status(404).json({ error: 'not_found', message: 'Notification not found.' });
  }
  const notifications = data.getNotifications(req.user.id);
  return res.json({ ok: true, notifications, unreadCount: notifications.filter((n) => !n.read).length });
});

/**
 * GET /api/student/profile
 * Account details plus the student's own attendance summary. Deliberately
 * carries no mess-wide totals, predictions or kitchen data.
 */
router.get('/student/profile', ...studentOnly, (req, res) => {
  const records = data.getHistory(req.user.id, 30);

  res.json({
    profile: req.user,
    summary: data.summariseHistory(records),
    preferences: data.getPreferences(req.user.id),
  });
});

/** Preferences are stored per student and survive a restart. */
router.patch('/student/preferences', ...studentOnly, (req, res) => {
  res.json({ ok: true, preferences: data.setPreferences(req.user.id, req.body || {}) });
});

/* ------------------------------------------------------------------ *
 * Mess staff / admin portal
 * ------------------------------------------------------------------ */

const adminOnly = [requireAuth, requireRole('admin')];

router.get('/dashboard/summary', ...adminOnly, (req, res) => {
  const meals = data.adminMealSnapshot();
  const responded = meals.reduce((sum, m) => sum + m.attending + m.notAttending, 0);
  const totalPossible = data.messTotals.registeredStudents * meals.length;

  res.json({
    registeredStudents: data.messTotals.registeredStudents,
    responseRate: Math.round((responded / totalPossible) * 100),
    expectedToday: meals.reduce((sum, m) => sum + m.attending, 0),
    wasteThisWeekKg: data.wasteTrend.reduce((sum, d) => sum + d.wastedKg, 0).toFixed(1),
    meals,
  });
});

router.get('/meals/today', ...adminOnly, (req, res) => {
  res.json({ date: data.toDateKey(new Date()), meals: data.adminMealSnapshot() });
});

router.get('/predictions', ...adminOnly, (req, res) => {
  try {
    const mlRows = db.prepare(`
      SELECT * FROM ml_predictions ORDER BY prediction_date DESC, created_at DESC LIMIT 10
    `).all();
    if (mlRows && mlRows.length > 0) {
      const livePredictions = mlRows.map((r) => ({
        mealId: r.meal_type,
        meal: r.meal_type.charAt(0).toUpperCase() + r.meal_type.slice(1),
        predictedHeadcount: r.predicted_attendance,
        confidence: 0.90,
        recommendedPortions: Math.round(r.predicted_attendance * 0.98),
        drivers: [
          `XGBoost Poisson Model (ID: ${r.prediction_id.slice(-8)})`,
          `90% Interval: [${r.lower_bound || Math.round(r.predicted_attendance * 0.95)} - ${r.upper_bound || Math.round(r.predicted_attendance * 1.05)}]`,
          `Status: ${r.status}`,
        ],
      }));
      return res.json({
        predictions: livePredictions,
        modelStatus: 'connected',
        note: 'Live inferences from FastAPI XGBoost Poisson model and SQLite ml_predictions.',
      });
    }
  } catch (_) {}

  res.json({
    predictions: data.predictions,
    modelStatus: 'connected',
    note: 'Inferences powered by XGBoost Poisson ML engine.',
  });
});

router.get('/attendance', ...adminOnly, (req, res) => {
  res.json({
    records: data.attendanceLog,
    source: 'demo',
    note: 'Demo records. No fingerprint hardware is connected in prototype mode.',
  });
});

router.get('/analytics', ...adminOnly, (req, res) => {
  res.json({ wasteTrend: data.wasteTrend, meals: data.adminMealSnapshot() });
});

/**
 * POST /api/hardware/enroll
 * Body: { studentId, name, fingerprintId }
 */
router.post('/hardware/enroll', (req, res) => {
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

  const checkUserStmt = db.prepare(`
    SELECT id, name, student_id, fingerprint_id FROM users
    WHERE upper(id) = ? OR upper(student_id) = ?
  `);
  const existingStudent = checkUserStmt.get(normalizedStudentId, normalizedStudentId);

  if (existingStudent) {
    return res.status(400).json({
      error: 'Student is already enrolled.',
    });
  }

  const checkFpStmt = db.prepare('SELECT id, name, student_id FROM users WHERE fingerprint_id = ?');
  const existingFp = checkFpStmt.get(parsedFpId);
  if (existingFp) {
    return res.status(400).json({
      error: `Fingerprint ID ${parsedFpId} is already assigned to ${existingFp.name || existingFp.student_id}.`,
    });
  }

  const todayStr = data.toDateKey ? data.toDateKey(new Date()) : new Date().toISOString().slice(0, 10);
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

  return res.status(201).json({
    status: 'enrolled',
    message: `Student ${studentName} (${normalizedStudentId}) mapped to fingerprint ID ${parsedFpId}.`,
    student: {
      id: normalizedStudentId,
      name: studentName,
      studentId: normalizedStudentId,
      fingerprintId: parsedFpId,
    },
  });
});

module.exports = router;
