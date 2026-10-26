const path = require('path');
const express = require('express');
const router = express.Router();
const mockData = require('../mockData');
const store = require('../store');
const { db } = require('../db');
const {
  buildMlPayload,
  generateMealPrediction,
  recordSessionAttendance,
  getLatestPrediction,
  toDateString,
} = require('../utils/mlMetricUtility');
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

/**
 * POST /api/auth/register-request
 * Body: { name, email, role, hostel, studentId/regNo }
 */
router.post('/auth/register-request', async (req, res) => {
  const { name, email, role, hostel, studentId, regNo } = req.body || {};

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.endsWith('@vitap.ac.in') && !normalizedEmail.endsWith('@vitapstudent.ac.in')) {
    return res.status(400).json({
      error: 'Invalid domain. Allowed emails must end with @vitap.ac.in or @vitapstudent.ac.in.',
      message: 'Invalid domain. Allowed emails must end with @vitap.ac.in or @vitapstudent.ac.in.',
    });
  }

  // Check if account already exists
  const existingUser = store.getUserByEmail ? store.getUserByEmail(normalizedEmail) : store.findUserForLogin(normalizedEmail);
  if (existingUser && (existingUser.id || existingUser.user)) {
    return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
  }

  const cleanRole = role === 'student' ? 'student' : 'admin';
  const effectiveHostel = hostel ? String(hostel).trim() : 'MH-1';
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
    hostel: effectiveHostel,
    studentId: (studentId || regNo) ? String(studentId || regNo).trim().toUpperCase() : null,
  };

  storePendingRegistration(normalizedEmail, regData);

  const otp = generateOtp();
  storeOtp(normalizedEmail, otp);

  try {
    await sendOtpEmail(normalizedEmail, otp);
  } catch (err) {
    console.error('[AUTH] Failed to send registration OTP email:', err.message || err);
    return res.status(500).json({
      error: 'Failed to send verification code. Please try again later.',
      message: err.message || 'Failed to send verification code.',
    });
  }

  return res.json({
    success: true,
    message: 'Verification OTP sent to your college email.',
  });
});

/**
 * POST /api/auth/register-verify
 * Body: { email: string, otp: string }
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

  let newUser;
  try {
    newUser = store.registerUser({
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
    hostel: newUser.hostel || null,
    studentId: newUser.studentId || null,
    regNo: newUser.studentId || null,
  };

  const token = issueToken(payload);

  try {
    store.createSession(token, newUser.id);
  } catch (err) {}

  return res.json({
    success: true,
    token,
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      hostel: newUser.hostel || null,
      studentId: newUser.studentId || null,
      regNo: newUser.studentId || null,
      messName: newUser.mess || (newUser.hostel ? `Mess - ${newUser.hostel}` : mockData.mess.name),
    },
  });
});

/**
 * POST /api/auth/request-otp (Login Flow)
 * Body: { email: string }
 * Strictly checks that email ends with @vitap.ac.in or @vitapstudent.ac.in.
 * If account not found: returns 404 {"error": "Account not found. Please sign up first."}.
 * Strictly conceals OTP from JSON response.
 */
router.post('/auth/request-otp', async (req, res) => {
  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.trim()) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.endsWith('@vitap.ac.in') && !normalizedEmail.endsWith('@vitapstudent.ac.in')) {
    return res.status(400).json({
      error: 'Invalid domain. Allowed emails must end with @vitap.ac.in or @vitapstudent.ac.in.',
      message: 'Invalid domain. Allowed emails must end with @vitap.ac.in or @vitapstudent.ac.in.',
    });
  }

  const user = store.getUserByEmail ? store.getUserByEmail(normalizedEmail) : null;
  const legacyFound = !user && store.findUserForLogin ? store.findUserForLogin(normalizedEmail) : null;
  const existingUser = user || legacyFound?.user;

  if (!existingUser) {
    return res.status(404).json({ error: 'Account not found. Please sign up first.' });
  }

  const otp = generateOtp();
  storeOtp(normalizedEmail, otp);

  try {
    await sendOtpEmail(normalizedEmail, otp);
  } catch (err) {
    console.error('[AUTH] Failed to send login OTP email:', err.message || err);
    return res.status(500).json({
      error: 'Failed to send verification code. Please try again later.',
      message: err.message || 'Failed to send verification code.',
    });
  }

  return res.json({
    success: true,
    message: 'OTP sent successfully to your VIT-AP email address.',
  });
});

/**
 * POST /api/auth/verify-otp (Login Flow)
 * Body: { email: string, otp: string }
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

  let user = store.getUserByEmail ? store.getUserByEmail(normalizedEmail) : null;
  if (!user && store.findUserForLogin) {
    const found = store.findUserForLogin(normalizedEmail);
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
    hostel: user.hostel || null,
    studentId: user.studentId || user.regNo || null,
    regNo: user.studentId || user.regNo || null,
  };

  const token = issueToken(payload);

  try {
    store.createSession(token, user.id);
  } catch (err) {}

  return res.json({
    success: true,
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      hostel: user.hostel || null,
      studentId: user.studentId || user.regNo || null,
      regNo: user.studentId || user.regNo || null,
      messName: user.mess || (user.hostel ? `Mess - ${user.hostel}` : mockData.mess.name),
    },
  });
});

// Auth Login
router.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (email === 'mess.admin@smartmess.demo' && password === 'Mess@123') {
    res.json({
      success: true,
      token: 'demo-jwt-token-12345',
      user: {
        name: mockData.mess.staffName,
        email: mockData.mess.email,
        role: mockData.mess.role,
        messName: mockData.mess.name
      }
    });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// Profile / Mess Info
router.get('/profile', (req, res) => {
  res.json(mockData.mess);
});

// Dashboard Summary (integrates live DB stats and pre-meal ML attendance predictions)
router.get('/dashboard/summary', async (req, res) => {
  try {
    const localMinutes = req.query.localMinutes !== undefined ? parseInt(req.query.localMinutes, 10) : undefined;
    const clientDate = req.query.date || undefined;
    const liveStats = store.getLiveStats(localMinutes, clientDate);
    const todayStr = liveStats.effectiveDate || liveStats.date || toDateString(new Date());

    // Resolve current and next meal IDs
    const currentMealId = liveStats.currentMeal?.id || 'lunch';
    const nextMealId = liveStats.nextMeal?.id || 'dinner';

    // 1. Pre-meal ML Prediction for current meal
    let currentPred = getLatestPrediction(currentMealId, todayStr);
    if (!currentPred) {
      const mlRes = await generateMealPrediction({ mealId: currentMealId, date: todayStr });
      currentPred = {
        prediction_id: mlRes.prediction_id,
        predicted_attendance: mlRes.predicted_attendance,
        lower_bound: mlRes.lower_bound,
        upper_bound: mlRes.upper_bound,
      };
    }

    // 2. Pre-meal ML Prediction for upcoming (next) meal
    let nextPred = getLatestPrediction(nextMealId, todayStr);
    if (!nextPred) {
      const mlRes = await generateMealPrediction({ mealId: nextMealId, date: todayStr });
      nextPred = {
        prediction_id: mlRes.prediction_id,
        predicted_attendance: mlRes.predicted_attendance,
        lower_bound: mlRes.lower_bound,
        upper_bound: mlRes.upper_bound,
      };
    }

    // 3. Inject ML predictions into liveStats
    if (currentPred?.predicted_attendance) {
      liveStats.currentMeal.predicted = currentPred.predicted_attendance;
      liveStats.currentMeal.predictionId = currentPred.prediction_id;
      liveStats.currentMeal.lowerBound = currentPred.lower_bound;
      liveStats.currentMeal.upperBound = currentPred.upper_bound;
      liveStats.summary.predicted = currentPred.predicted_attendance;
    }

    if (nextPred?.predicted_attendance) {
      liveStats.nextMeal.predicted = nextPred.predicted_attendance;
      liveStats.nextMeal.predictionId = nextPred.prediction_id;
      liveStats.nextMeal.lowerBound = nextPred.lower_bound;
      liveStats.nextMeal.upperBound = nextPred.upper_bound;
      liveStats.nextMeal.recommended = Math.round(nextPred.predicted_attendance * 0.98);
    }

    // 4. Update fullDay predicted total
    const fullDaySum = (liveStats.meals || []).reduce((acc, m) => {
      const pred = getLatestPrediction(m.id, todayStr)?.predicted_attendance || m.predicted;
      return acc + pred;
    }, 0);
    if (fullDaySum > 0) {
      liveStats.fullDay.predicted = fullDaySum;
    }

    const realRecentActivity = store.getRecentActivity ? store.getRecentActivity(6) : (liveStats.recentActivity || []);

    return res.json({
      currentMeal: liveStats.currentMeal,
      nextMeal: liveStats.nextMeal,
      fullDay: liveStats.fullDay,
      summary: liveStats.summary,
      recentActivity: realRecentActivity,
      notifications: mockData.notifications,
      meals: liveStats.meals,
      mlModel: 'XGBoost Poisson',
    });
  } catch (err) {
    console.error('[dashboard/summary error]:', err);
    const localMinutes = req.query.localMinutes !== undefined ? parseInt(req.query.localMinutes, 10) : undefined;
    const clientDate = req.query.date || undefined;
    const liveStats = store.getLiveStats(localMinutes, clientDate);
    const realRecentActivity = store.getRecentActivity ? store.getRecentActivity(6) : (liveStats.recentActivity || []);
    return res.json({
      currentMeal: liveStats.currentMeal,
      nextMeal: liveStats.nextMeal,
      fullDay: liveStats.fullDay,
      summary: liveStats.summary,
      recentActivity: realRecentActivity,
      notifications: mockData.notifications,
      meals: liveStats.meals,
    });
  }
});

// Today's Meals (uses live DB snapshot from smartmess.db)
router.get('/meals/today', (req, res) => {
  const snapshot = store.adminMealSnapshot();
  const todayStr = toDateString(new Date());
  // Augment with stored ML predictions if available
  const augmented = snapshot.map((m) => {
    const ml = getLatestPrediction(m.id, todayStr);
    return ml ? { ...m, predicted: ml.predicted_attendance, predictionId: ml.prediction_id } : m;
  });
  res.json(augmented);
});

// Explicit Pre-meal ML Prediction Trigger
router.post('/predictions/predict', async (req, res) => {
  try {
    const { mealId, date, registeredStudents, onLeave } = req.body || {};
    const result = await generateMealPrediction({
      mealId: mealId || 'lunch',
      date: date || new Date(),
      registeredStudents,
      onLeave,
    });
    return res.json(result);
  } catch (err) {
    console.error('[API /predictions/predict error]:', err);
    return res.status(500).json({ error: 'prediction_failed', message: err.message });
  }
});

// Helper to calculate & aggregate total attendance count for past meals from SQLite
function getAggregatedHistory() {
  // 1. Calculate verified attendance counts for all recorded past meals from attendance table
  const pastAttendanceStmt = db.prepare(`
    SELECT meal_date, meal_id, COUNT(*) as verified_count
    FROM attendance
    WHERE status = 'verified'
    GROUP BY meal_date, meal_id
  `);
  const attendanceCounts = new Map();
  try {
    pastAttendanceStmt.all().forEach((row) => {
      attendanceCounts.set(`${row.meal_date}_${row.meal_id.toLowerCase()}`, row.verified_count);
    });
  } catch (err) {
    console.warn('[attendance agg error]:', err.message);
  }

  // 2. Fetch ML predictions from ml_predictions
  let mlRows = [];
  try {
    const predictionsStmt = db.prepare(`
      SELECT prediction_id, prediction_date, meal_type, predicted_attendance, actual_attendance, lower_bound, upper_bound, status, created_at
      FROM ml_predictions
      ORDER BY prediction_date DESC, created_at DESC
    `);
    mlRows = predictionsStmt.all();
  } catch (err) {
    console.warn('[ml_predictions fetch warning]:', err.message);
  }

  const updateActualStmt = db.prepare(`
    UPDATE ml_predictions
    SET actual_attendance = ?, status = 'recorded', recorded_at = CURRENT_TIMESTAMP
    WHERE prediction_id = ?
  `);

  const processedKeys = new Set();
  const results = [];

  // 3. Process ML prediction rows
  for (const r of mlRows) {
    const key = `${r.prediction_date}_${r.meal_type.toLowerCase()}`;
    processedKeys.add(key);

    let actual = r.actual_attendance;
    const dbCount = attendanceCounts.get(key);

    // If actual is missing in ml_predictions, populate it from attendance table count
    if (actual === null || actual === undefined) {
      if (dbCount !== undefined) {
        actual = dbCount;
        try {
          updateActualStmt.run(actual, r.prediction_id);
        } catch (_) {}
      }
    }

    const predicted = r.predicted_attendance;
    const accuracy = (actual !== null && actual !== undefined && actual > 0 && predicted)
      ? Math.max(0, Math.min(100, Number(((1 - Math.abs(actual - predicted) / Math.max(actual, predicted)) * 100).toFixed(1))))
      : (actual === 0 && predicted ? 0 : null);

    results.push({
      date: r.prediction_date,
      meal: r.meal_type.charAt(0).toUpperCase() + r.meal_type.slice(1),
      mealId: r.meal_type.toLowerCase(),
      predicted: predicted,
      actual: actual !== null && actual !== undefined ? actual : (dbCount !== undefined ? dbCount : null),
      lowerBound: r.lower_bound,
      upperBound: r.upper_bound,
      status: (actual !== null && actual !== undefined) ? 'recorded' : r.status,
      predictionId: r.prediction_id,
      accuracy,
    });
  }

  // 4. Also fetch past sessions from attendance table that don't yet have an ml_predictions row
  try {
    const remainingSessionsStmt = db.prepare(`
      SELECT 
        a.meal_date as date,
        a.meal_id as meal_id,
        COUNT(*) as actual_count,
        (SELECT COUNT(*) FROM meal_intents i WHERE i.meal_date = a.meal_date AND i.meal_id = a.meal_id AND i.intent = 'attending') as intent_count
      FROM attendance a
      WHERE a.status = 'verified'
      GROUP BY a.meal_date, a.meal_id
      ORDER BY a.meal_date DESC,
        CASE a.meal_id WHEN 'dinner' THEN 3 WHEN 'lunch' THEN 2 WHEN 'breakfast' THEN 1 ELSE 0 END DESC
      LIMIT 50
    `);

    const remainingRows = remainingSessionsStmt.all();
    for (const row of remainingRows) {
      const key = `${row.date}_${row.meal_id.toLowerCase()}`;
      if (!processedKeys.has(key)) {
        processedKeys.add(key);
        const actual = row.actual_count;
        const predicted = row.intent_count > 0 ? row.intent_count : actual;
        const accuracy = (actual > 0 && predicted)
          ? Math.max(0, Math.min(100, Number(((1 - Math.abs(actual - predicted) / Math.max(actual, predicted)) * 100).toFixed(1))))
          : 100.0;

        results.push({
          date: row.date,
          meal: row.meal_id.charAt(0).toUpperCase() + row.meal_id.slice(1),
          mealId: row.meal_id.toLowerCase(),
          predicted,
          actual,
          lowerBound: Math.round(predicted * 0.95),
          upperBound: Math.round(predicted * 1.05),
          status: 'recorded',
          predictionId: `hist_${row.date}_${row.meal_id}`,
          accuracy,
        });
      }
    }
  } catch (err) {
    console.warn('[remaining attendance fetch error]:', err.message);
  }

  // Sort by date DESC, then meal (dinner > lunch > breakfast)
  results.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    const order = { dinner: 3, lunch: 2, breakfast: 1 };
    return (order[b.mealId] || 0) - (order[a.mealId] || 0);
  });

  return results.slice(0, 30);
}

// Predictions & History Endpoint (populated with live SQLite attendance counts)
router.get('/predictions', (req, res) => {
  try {
    const history = getAggregatedHistory();
    if (history && history.length > 0) {
      return res.json(history);
    }
  } catch (err) {
    console.warn('[predictions fetch warning]:', err.message);
  }
  return res.json(mockData.history);
});

// Dedicated History Endpoint (alias to /predictions for direct history fetch)
router.get('/history', (req, res) => {
  try {
    const history = getAggregatedHistory();
    if (history && history.length > 0) {
      return res.json(history);
    }
  } catch (err) {
    console.warn('[history fetch warning]:', err.message);
  }
  return res.json(mockData.history);
});

// Attendance History
router.get('/attendance', (req, res) => {
  res.json(mockData.attendance);
});

// Analytics (dynamically aggregated from live history records)
router.get('/analytics', (req, res) => {
  try {
    const history = getAggregatedHistory();
    const withAccuracy = history.filter(h => h.accuracy !== null && h.accuracy !== undefined && !isNaN(h.accuracy));
    if (withAccuracy.length > 0) {
      const accuracies = withAccuracy.map(h => Number(h.accuracy));
      const errors = history
        .filter(h => h.actual !== null && h.actual !== undefined && h.predicted !== null && h.predicted !== undefined)
        .map(h => Math.abs(h.actual - h.predicted));

      const avgAccuracy = (accuracies.reduce((a, b) => a + b, 0) / accuracies.length).toFixed(1);
      const avgError = errors.length > 0 ? Math.round(errors.reduce((a, b) => a + b, 0) / errors.length) : 0;
      const maxAccuracy = Math.max(...accuracies).toFixed(1);
      const minAccuracy = Math.min(...accuracies).toFixed(1);

      return res.json({
        averageAccuracy: Number(avgAccuracy),
        averageError: avgError,
        highestAccuracy: Number(maxAccuracy),
        lowestAccuracy: Number(minAccuracy),
        trend: 2.1,
      });
    }
  } catch (err) {
    console.warn('[analytics calculation warning]:', err.message);
  }
  return res.json(mockData.analytics);
});

// Hardware bridge routes (delegated to store)
router.get('/hardware/status', (req, res) => {
  res.json(store.getHardwareStatus());
});

router.post('/hardware/mode', (req, res) => {
  const { mode } = req.body || {};
  if (!mode || (mode !== 'verify' && mode !== 'enroll')) {
    return res.status(400).json({ error: 'invalid_mode', message: "Mode must be 'verify' or 'enroll'." });
  }
  const updatedStatus = store.setHardwareMode(mode);
  const io = req.app.get('io');
  if (io) io.emit('hardware:mode_changed', updatedStatus);
  return res.json({ status: 'success', message: `Hardware mode set to ${mode}`, ...updatedStatus });
});

router.post('/hardware/captured', (req, res) => {
  const { newFingerprintId, deviceId } = req.body || {};
  if (newFingerprintId === undefined || newFingerprintId === null) {
    return res.status(400).json({ error: 'missing_id', message: 'newFingerprintId is required.' });
  }
  const result = store.recordCapturedFingerprint(newFingerprintId);
  if (result.error) return res.status(400).json(result);

  const payload = {
    fingerprintId: result.fingerprintId,
    timestamp: new Date().toISOString(),
    deviceId: deviceId || 'ESP32_GATE',
  };
  const io = req.app.get('io');
  if (io) io.emit('hardware:fingerprint_captured', payload);

  return res.json({
    status: 'success',
    message: `New fingerprint ID ${result.fingerprintId} captured and ready to map.`,
    ...payload,
  });
});

router.post('/hardware/scan', (req, res) => {
  const { studentId, fingerprintId, deviceId } = req.body || {};
  if (studentId === undefined && fingerprintId === undefined) {
    return res.status(400).json({
      error: 'missing_identifier',
      message: 'Either fingerprintId or studentId is required.',
    });
  }

  const scanResult = store.recordHardwareScan({ studentId, fingerprintId, deviceId });
  const liveStats = store.getLiveStats();

  const io = req.app.get('io');
  if (io) {
    io.emit('attendance:update', scanResult);
    io.emit('dashboard:stats_changed', liveStats);
  }

  let statusCode = 200;
  if (scanResult.status === 'unregistered') statusCode = 404;
  else if (scanResult.status === 'error') statusCode = 400;

  return res.status(statusCode).json(scanResult);
});

router.post('/hardware/enroll', (req, res) => {
  const { studentId, name, fingerprintId } = req.body || {};
  if (!studentId || !name || fingerprintId === undefined || fingerprintId === null) {
    return res.status(400).json({ error: 'missing_fields', message: 'studentId, name, and fingerprintId are all required for enrollment.' });
  }
  const normalizedStudentId = String(studentId).trim().toUpperCase();
  const trimmedName = String(name).trim();
  const parsedFpId = parseInt(fingerprintId, 10);

  const nameRegex = /^[A-Za-z\s]+$/;
  const studentIdRegex = /^\d{2}[A-Za-z]{3}\d{4,5}$/;

  if (!nameRegex.test(trimmedName)) {
    return res.status(400).json({ error: 'invalid_name', message: 'Name must only contain letters and spaces.' });
  }

  if (!studentIdRegex.test(normalizedStudentId)) {
    return res.status(400).json({
      error: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
      message: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
    });
  }

  if (isNaN(parsedFpId)) {
    return res.status(400).json({ error: 'invalid_fingerprint_id', message: 'fingerprintId must be an integer.' });
  }

  const result = store.enrollStudent({ studentId: normalizedStudentId, name: trimmedName, fingerprintId: parsedFpId });
  if (result.error === 'already_enrolled') {
    return res.status(400).json({ error: 'Student is already enrolled.' });
  }
  if (result.error) return res.status(400).json({ error: result.message || result.error });

  return res.json({
    status: 'success',
    message: `Fingerprint ID ${parsedFpId} successfully assigned to ${result.user.name} (${result.user.studentId || result.user.id}).`,
    user: result.user,
  });
});

/**
 * POST /api/internal/intent-update
 * Inter-service synchronization: Receives intent updates from student backend
 * and broadcasts Socket.IO events to connected Mess frontend clients.
 */
router.post('/internal/intent-update', (req, res) => {
  const intentData = req.body || {};
  const io = req.app.get('io');
  if (io) {
    io.emit('intent:update', intentData);
    const liveStats = store.getLiveStats();
    io.emit('dashboard:stats_changed', liveStats);
  }
  return res.json({ ok: true });
});

module.exports = router;
