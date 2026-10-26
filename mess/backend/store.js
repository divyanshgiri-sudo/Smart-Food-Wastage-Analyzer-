/**
 * Smart Food Wastage Analyser — data access layer.
 *
 * Every accessor here used to read from an in-memory Map; each one now runs a
 * SQL query against SQLite (see db/schema.sql). The signatures and the returned
 * shapes are unchanged, which is why routes/api.js and the whole React frontend
 * needed no edits when the database landed.
 *
 * This is the only module in the backend that writes SQL.
 *
 * Still placeholder, and clearly labelled as such in the UI:
 *   messTotals / predictions / wasteTrend / attendanceLog
 *     — mess-wide aggregates that belong to the ML and fingerprint phases.
 *       Everything a student sees about themselves is real, persisted data.
 */

const { db, dbPath } = require('./db');
const { seedReferenceData } = require('./db/seed');

const MINUTE = 60 * 1000;
const TIMEZONE = process.env.TIMEZONE || 'Asia/Kolkata';

/* ------------------------------------------------------------------ *
 * Date helpers
 * ------------------------------------------------------------------ */

function toDateKey(date, timeZone = TIMEZONE) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  const d = date instanceof Date ? date : new Date(date || Date.now());
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  } catch (e) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

function getTodayDateKey(timeZone = TIMEZONE) {
  return toDateKey(new Date(), timeZone);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function minutesNow(now = new Date(), timeZone = TIMEZONE) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = parseInt(parts.find((p) => p.type === 'hour').value, 10);
    const minute = parseInt(parts.find((p) => p.type === 'minute').value, 10);
    return hour * 60 + minute;
  } catch (e) {
    return now.getHours() * 60 + now.getMinutes();
  }
}

function atMinutes(dateKey, mins) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, Math.floor(mins / 60), mins % 60, 0, 0);
}

/* ------------------------------------------------------------------ *
 * Startup
 * ------------------------------------------------------------------ */

try {
  seedReferenceData();
} catch (err) {
  if (err.message.includes('locked') || err.message.includes('busy')) {
    console.log('[store] Database locked by another process during startup seed; skipping redundant seed.');
  } else {
    throw err;
  }
}

/* ------------------------------------------------------------------ *
 * Accounts (used by auth.js)
 * ------------------------------------------------------------------ */

// Selected explicitly so password_hash can never leave this module by accident.
const USER_COLUMNS = `
  id, role, name, email, designation, mess,
  student_id AS studentId, student_id AS regNo, fingerprint_id AS fingerprintId, hostel, room, program, year,
  mess_plan AS messPlan, joined_on AS joinedOn
`;

// Drops the columns that are null for this role, so a student profile does not
// carry empty staff fields and vice versa.
function shapeUser(row) {
  if (!row) return null;
  const user = {};
  Object.entries(row).forEach(([k, v]) => {
    if (v !== null) user[k] = v;
  });
  return user;
}

const findUserRowByLoginStmt = db.prepare(`
  SELECT ${USER_COLUMNS}, password_hash AS passwordHash
  FROM users
  WHERE lower(email) = ? OR lower(student_id) = ?
`);

/** Looks a user up by email or student ID. Includes the hash — auth.js only. */
function findUserForLogin(identifier) {
  const needle = String(identifier || '').trim().toLowerCase();
  if (!needle) return null;
  const row = findUserRowByLoginStmt.get(needle, needle);
  if (!row) return null;
  const { passwordHash, ...rest } = row;
  return { passwordHash, user: shapeUser(rest) };
}

const getUserByIdStmt = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`);

function getUserById(id) {
  return shapeUser(getUserByIdStmt.get(id));
}

const getUserByEmailStmt = db.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE lower(email) = ?`);

function getUserByEmail(email) {
  const needle = String(email || '').trim().toLowerCase();
  if (!needle) return null;
  return shapeUser(getUserByEmailStmt.get(needle));
}

const insertRegisteredUserStmt = db.prepare(`
  INSERT INTO users (id, role, name, email, password_hash, student_id, hostel, mess, designation, joined_on)
  VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?)
`);

const updateExistingStudentOnRegisterStmt = db.prepare(`
  UPDATE users
  SET name = ?, email = ?, role = ?, hostel = COALESCE(?, hostel)
  WHERE lower(student_id) = ? OR lower(id) = ?
`);

function registerUser({ id, role, name, email, studentId, hostel, mess, designation }) {
  const normalizedEmail = String(email).trim().toLowerCase();
  const cleanRole = role === 'admin' ? 'admin' : 'student';
  const cleanStudentId = studentId ? String(studentId).trim().toUpperCase() : null;
  const userId = id || (cleanRole === 'admin' ? `admin-${Date.now().toString(36)}` : (cleanStudentId || `stu-${Date.now().toString(36)}`));
  const todayStr = toDateKey(new Date());

  // If a student record with this registration number already exists (e.g. from fingerprint enrollment)
  if (cleanRole === 'student' && cleanStudentId) {
    const existing = getUserById(cleanStudentId);
    if (existing) {
      updateExistingStudentOnRegisterStmt.run(
        name.trim(),
        normalizedEmail,
        cleanRole,
        hostel || null,
        cleanStudentId.toLowerCase(),
        cleanStudentId.toLowerCase()
      );
      return getUserById(existing.id);
    }
  }

  insertRegisteredUserStmt.run(
    userId,
    cleanRole,
    name.trim(),
    normalizedEmail,
    cleanStudentId,
    hostel || null,
    mess || (cleanRole === 'admin' ? (hostel ? `Mess - ${hostel}` : 'Central Mess — Block A') : null),
    designation || (cleanRole === 'admin' ? 'Mess Administrator' : null),
    todayStr
  );

  return getUserById(userId);
}

/* ------------------------------------------------------------------ *
 * Sessions
 * ------------------------------------------------------------------ *
 * In the database rather than a process-local Map, so restarting the API no
 * longer signs every open tab out.
 */

const createSessionStmt = db.prepare(
  'INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)',
);
const deleteSessionStmt = db.prepare('DELETE FROM sessions WHERE token = ?');
const userForSessionStmt = db.prepare(`
  SELECT
    u.id, u.role, u.name, u.email, u.designation, u.mess,
    u.student_id AS studentId, u.hostel, u.room, u.program, u.year,
    u.mess_plan AS messPlan, u.joined_on AS joinedOn
  FROM sessions s JOIN users u ON u.id = s.user_id
  WHERE s.token = ?
`);

function createSession(token, userId) {
  createSessionStmt.run(token, userId, new Date().toISOString());
}

function deleteSession(token) {
  return deleteSessionStmt.run(token).changes > 0;
}

function userForSession(token) {
  if (!token) return null;
  return shapeUser(userForSessionStmt.get(token));
}

/* ------------------------------------------------------------------ *
 * Meals and menu
 * ------------------------------------------------------------------ */

const listMealsStmt = db.prepare('SELECT * FROM meals ORDER BY sort_order');
const getMealStmt = db.prepare('SELECT * FROM meals WHERE id = ?');
const menuForDayStmt = db.prepare(`
  SELECT meal_id, item FROM menu_items WHERE day_of_week = ? ORDER BY meal_id, position
`);

/** { breakfast: [...items], lunch: [...], dinner: [...] } for a JS day-of-week. */
function menuForDay(dayOfWeek) {
  const menu = {};
  menuForDayStmt.all(dayOfWeek).forEach(({ meal_id: mealId, item }) => {
    (menu[mealId] = menu[mealId] || []).push(item);
  });
  return menu;
}

/** Meal definitions in camelCase, for anything outside this module. */
function getMealDefinitions() {
  return listMealsStmt.all().map((m) => ({
    id: m.id,
    name: m.name,
    window: m.time_window,
    startMin: m.start_min,
    endMin: m.end_min,
    cutoffMin: m.cutoff_min,
    cutoffLabel: m.cutoff_label,
  }));
}

const mealsForDateStmt = db.prepare(`
  SELECT
    m.id, m.name, m.time_window, m.start_min, m.end_min, m.cutoff_min, m.cutoff_label,
    i.intent            AS intent,
    i.updated_at        AS intentUpdatedAt,
    a.status            AS attendanceStatus,
    a.source            AS attendanceSource,
    a.verified_at       AS attendanceVerifiedAt
  FROM meals m
  LEFT JOIN meal_intents i
    ON i.meal_id = m.id AND i.student_id = @studentId AND i.meal_date = @dateKey
  LEFT JOIN attendance a
    ON a.meal_id = m.id AND a.student_id = @studentId AND a.meal_date = @dateKey
  ORDER BY m.sort_order
`);

const resolveUserIdStmt = db.prepare(`
  SELECT id FROM users WHERE id = ? OR student_id = ? OR lower(email) = ?
`);

function resolveUserId(identifier) {
  if (!identifier) return null;
  const str = String(identifier).trim();
  const row = resolveUserIdStmt.get(str, str, str.toLowerCase());
  return row ? row.id : str;
}

/**
 * Builds the meal list for one date from the student's point of view — menu,
 * timing, cutoff, their own intent and their own attendance in one shape.
 */
function getMealsForDate(studentIdInput, dateInput) {
  const studentId = resolveUserId(studentIdInput);
  const dateKey = toDateKey(dateInput);
  const [y, m, d] = dateKey.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const menu = menuForDay(dateObj.getDay());
  const now = new Date();
  const todayKey = toDateKey(now);
  const isToday = dateKey === todayKey;
  const isPast = dateKey < todayKey;
  const nowMin = minutesNow(now);

  return mealsForDateStmt.all({ studentId, dateKey }).map((row) => {
    const cutoffAt = atMinutes(dateKey, row.cutoff_min);

    let status = 'upcoming';
    if (isPast) status = 'completed';
    else if (isToday) {
      if (nowMin >= row.end_min) status = 'completed';
      else if (nowMin >= row.start_min) status = 'serving';
    }

    const currentIntent = row.intent || 'none';

    return {
      id: row.id,
      name: row.name,
      date: dateKey,
      time: row.time_window,
      cutoffLabel: row.cutoff_label,
      cutoffAt: cutoffAt.toISOString(),
      // Intent editing closes at the cutoff; future dates are always open.
      intentOpen: now.getTime() < cutoffAt.getTime(),
      menu: menu[row.id] || [],
      status,
      studentIntent: currentIntent,
      userIntent: currentIntent,
      intent: currentIntent,
      intentUpdatedAt: row.intentUpdatedAt,
      attendanceStatus: row.attendanceStatus || 'none',
      attendanceSource: row.attendanceSource,
      attendanceVerifiedAt: row.attendanceVerifiedAt,
    };
  });
}

const upsertIntentStmt = db.prepare(`
  INSERT INTO meal_intents (student_id, meal_date, meal_id, intent, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (student_id, meal_date, meal_id)
  DO UPDATE SET intent = excluded.intent, updated_at = excluded.updated_at
`);

/**
 * Records a student's meal intention. Returns an `error` for an unknown meal or
 * a passed cutoff, so the route layer can answer 404 / 409.
 */
function setMealIntent(studentIdInput, dateKeyInput, mealId, intent) {
  const studentId = resolveUserId(studentIdInput);
  const dateKey = toDateKey(dateKeyInput);
  const meal = getMealStmt.get(mealId);
  if (!meal) return { error: 'unknown_meal' };

  const cutoffAt = atMinutes(dateKey, meal.cutoff_min);
  if (Date.now() >= cutoffAt.getTime()) return { error: 'cutoff_passed' };

  upsertIntentStmt.run(studentId, dateKey, mealId, intent, new Date().toISOString());
  return { ok: true, studentId, dateKey, mealId, intent };
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

// A row appears if EITHER an intent or an attendance record exists for that
// meal, which is why the two tables are unioned before being joined back.
const historyStmt = db.prepare(`
  WITH slots AS (
    SELECT meal_date, meal_id FROM meal_intents
      WHERE student_id = @studentId AND meal_date BETWEEN @from AND @to
    UNION
    SELECT meal_date, meal_id FROM attendance
      WHERE student_id = @studentId AND meal_date BETWEEN @from AND @to
  )
  SELECT
    s.meal_date                     AS date,
    s.meal_id                       AS mealId,
    m.name                          AS meal,
    COALESCE(i.intent, 'none')      AS intent,
    COALESCE(a.status, 'none')      AS attendanceStatus,
    a.source                        AS attendanceSource
  FROM slots s
  JOIN meals m ON m.id = s.meal_id
  LEFT JOIN meal_intents i
    ON i.student_id = @studentId AND i.meal_date = s.meal_date AND i.meal_id = s.meal_id
  LEFT JOIN attendance a
    ON a.student_id = @studentId AND a.meal_date = s.meal_date AND a.meal_id = s.meal_id
  ORDER BY s.meal_date DESC, m.sort_order
`);

/** Past meals only — today is still in progress, so it is excluded. */
function getHistory(studentId, days = 14) {
  const today = new Date();
  const rows = historyStmt.all({
    studentId,
    from: toDateKey(addDays(today, -days)),
    to: toDateKey(addDays(today, -1)),
  });

  return rows.map((row) => ({ id: `${row.date}-${row.mealId}`, ...row }));
}

function summariseHistory(rows) {
  const planned = rows.filter((r) => r.intent === 'attending').length;
  const skipped = rows.filter((r) => r.intent === 'not_attending').length;
  const attended = rows.filter((r) => r.attendanceStatus === 'verified').length;
  const noResponse = rows.filter((r) => r.intent === 'none').length;

  return {
    mealsPlanned: planned,
    mealsAttended: attended,
    mealsSkipped: skipped,
    noResponse,
    // Share of meals the student planned that they actually turned up for.
    attendanceRate: planned ? Math.round((attended / planned) * 100) : 0,
    totalRecords: rows.length,
  };
}

/** Per-day series for the student history chart (oldest first). */
function historyTrend(rows, days = 7) {
  const byDate = new Map();
  rows.forEach((row) => {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date, planned: 0, attended: 0 });
    const bucket = byDate.get(row.date);
    if (row.intent === 'attending') bucket.planned += 1;
    if (row.attendanceStatus === 'verified') bucket.attended += 1;
  });

  return Array.from(byDate.values())
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .slice(-days);
}

/* ------------------------------------------------------------------ *
 * Notifications
 * ------------------------------------------------------------------ */

// minutes_ago is resolved against "now" on every read, so demo timestamps stay
// fresh however long the database has existed.
const notificationsStmt = db.prepare(`
  SELECT n.id, n.type, n.title, n.body, n.minutes_ago AS minutesAgo,
         COALESCE(r.is_read, n.default_read) AS isRead
  FROM notifications n
  LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.student_id = ?
  ORDER BY n.sort_order
`);

function getNotifications(studentId) {
  return notificationsStmt.all(studentId).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    createdAt: new Date(Date.now() - n.minutesAgo * MINUTE).toISOString(),
    read: Boolean(n.isRead),
  }));
}

const markOneStmt = db.prepare(`
  INSERT INTO notification_reads (student_id, notification_id, is_read)
  VALUES (?, ?, ?)
  ON CONFLICT (student_id, notification_id) DO UPDATE SET is_read = excluded.is_read
`);
const markAllStmt = db.prepare(`
  INSERT INTO notification_reads (student_id, notification_id, is_read)
  SELECT ?, id, ? FROM notifications
  WHERE true
  ON CONFLICT (student_id, notification_id) DO UPDATE SET is_read = excluded.is_read
`);
const notificationExistsStmt = db.prepare('SELECT 1 FROM notifications WHERE id = ?');

/** `notificationId` accepts an id, or "all" to mark the whole list. */
function markNotification(studentId, notificationId, read = true) {
  if (notificationId === 'all') {
    markAllStmt.run(studentId, read ? 1 : 0);
    return true;
  }
  if (!notificationExistsStmt.get(notificationId)) return false;
  markOneStmt.run(studentId, notificationId, read ? 1 : 0);
  return true;
}

/* ------------------------------------------------------------------ *
 * Student preferences
 * ------------------------------------------------------------------ */

const DEFAULT_PREFERENCES = {
  notificationsEnabled: true,
  mealReminders: true,
  cutoffReminders: true,
  menuUpdates: false,
};

const getPreferencesStmt = db.prepare(`
  SELECT notifications_enabled AS notificationsEnabled,
         meal_reminders        AS mealReminders,
         cutoff_reminders      AS cutoffReminders,
         menu_updates          AS menuUpdates
  FROM preferences WHERE student_id = ?
`);

const upsertPreferencesStmt = db.prepare(`
  INSERT INTO preferences
    (student_id, notifications_enabled, meal_reminders, cutoff_reminders, menu_updates)
  VALUES (@studentId, @notificationsEnabled, @mealReminders, @cutoffReminders, @menuUpdates)
  ON CONFLICT (student_id) DO UPDATE SET
    notifications_enabled = excluded.notifications_enabled,
    meal_reminders        = excluded.meal_reminders,
    cutoff_reminders      = excluded.cutoff_reminders,
    menu_updates          = excluded.menu_updates
`);

function getPreferences(studentId) {
  const row = getPreferencesStmt.get(studentId);
  if (!row) return { ...DEFAULT_PREFERENCES };

  // SQLite has no boolean type — 0/1 come back as numbers.
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, Boolean(v)]));
}

/** Ignores unknown keys and non-booleans, so a bad body cannot corrupt a row. */
function setPreferences(studentId, patch) {
  const next = { ...getPreferences(studentId) };
  Object.keys(DEFAULT_PREFERENCES).forEach((k) => {
    if (typeof patch[k] === 'boolean') next[k] = patch[k];
  });

  upsertPreferencesStmt.run({
    studentId,
    notificationsEnabled: next.notificationsEnabled ? 1 : 0,
    mealReminders: next.mealReminders ? 1 : 0,
    cutoffReminders: next.cutoffReminders ? 1 : 0,
    menuUpdates: next.menuUpdates ? 1 : 0,
  });
  return next;
}

/* ------------------------------------------------------------------ *
 * Mess staff / admin data
 * ------------------------------------------------------------------ *
 * PLACEHOLDERS. These are mess-wide numbers for a 486-student mess, which the
 * two demo accounts obviously cannot produce. They belong to the ML and
 * fingerprint phases, and every screen that shows them says so.
 */

function getRegisteredStudentCount() {
  try {
    const row = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student'").get();
    return row?.count || 19;
  } catch (err) {
    return 19;
  }
}

const messTotals = {
  get registeredStudents() {
    return getRegisteredStudentCount();
  },
  respondedToday: 0,
};

const MEAL_BASELINES = {
  breakfast: 280,
  lunch: 410,
  dinner: 567,
};

function adminMealSnapshot(customDateKey, customMinutes) {
  const today = new Date();
  const dateKey = customDateKey || toDateKey(today);
  const menu = menuForDay(today.getDay());
  const nowMin = customMinutes !== undefined && customMinutes !== null ? Number(customMinutes) : minutesNow(today);
  const totalStudents = getRegisteredStudentCount();

  const liveAttendingStmt = db.prepare(`
    SELECT COUNT(*) as count FROM meal_intents WHERE meal_date = ? AND meal_id = ? AND intent = 'attending'
  `);
  const liveNotAttendingStmt = db.prepare(`
    SELECT COUNT(*) as count FROM meal_intents WHERE meal_date = ? AND meal_id = ? AND intent = 'not_attending'
  `);
  const liveServedStmt = db.prepare(`
    SELECT COUNT(*) as count FROM attendance WHERE meal_date = ? AND meal_id = ? AND status = 'verified'
  `);

  return listMealsStmt.all().map((meal) => {
    let status = 'Upcoming';
    let statusRaw = 'upcoming';
    if (nowMin >= meal.end_min) {
      status = 'Completed';
      statusRaw = 'completed';
    } else if (nowMin >= meal.start_min) {
      status = 'Serving';
      statusRaw = 'serving';
    }

    const dbAttending = liveAttendingStmt.get(dateKey, meal.id)?.count || 0;
    const dbNotAttending = liveNotAttendingStmt.get(dateKey, meal.id)?.count || 0;
    const dbServed = liveServedStmt.get(dateKey, meal.id)?.count || 0;

    const attending = dbAttending;
    const notAttending = dbNotAttending;
    const served = dbServed;
    const predicted = MEAL_BASELINES[meal.id] || attending;

    return {
      id: meal.id,
      name: meal.name,
      type: meal.name,
      date: dateKey,
      time: meal.time_window,
      startMin: meal.start_min,
      endMin: meal.end_min,
      cutoffLabel: meal.cutoff_label,
      menu: menu[meal.id] || [],
      status,
      statusRaw,
      predicted,
      confirmed: attending,
      attending,
      notAttending,
      actual: served,
      served,
      noResponse: Math.max(0, totalStudents - attending - notAttending),
    };
  });
}

// Shaped like the future Python model's response; modelStatus stays
// 'not_connected' until one is actually wired up.
const predictions = [
  { mealId: 'breakfast', meal: 'Breakfast', predictedHeadcount: 271, confidence: 0.88,
    recommendedPortions: 285, drivers: ['Weekday pattern', 'Response rate 71%', 'No exam window'] },
  { mealId: 'lunch', meal: 'Lunch', predictedHeadcount: 398, confidence: 0.91,
    recommendedPortions: 415, drivers: ['Popular menu item', 'High response rate', 'Weekday pattern'] },
  { mealId: 'dinner', meal: 'Dinner', predictedHeadcount: 203, confidence: 0.74,
    recommendedPortions: 220, drivers: ['Weekend outflow', 'Low response rate so far'] },
];

const wasteTrend = [
  { day: 'Mon', prepared: 1080, served: 968, wastedKg: 14.2 },
  { day: 'Tue', prepared: 1065, served: 981, wastedKg: 11.8 },
  { day: 'Wed', prepared: 1042, served: 972, wastedKg: 9.6 },
  { day: 'Thu', prepared: 1030, served: 964, wastedKg: 9.1 },
  { day: 'Fri', prepared: 1110, served: 1038, wastedKg: 10.4 },
  { day: 'Sat', prepared: 880, served: 792, wastedKg: 12.7 },
  { day: 'Sun', prepared: 845, served: 774, wastedKg: 10.9 },
];

const attendanceLog = [
  { id: 'a-1', studentId: '24BCE1187', name: 'Ved Kamath', meal: 'Breakfast', time: '08:12 AM', method: 'demo', status: 'verified' },
  { id: 'a-2', studentId: '24BCE1042', name: 'Aarav Menon', meal: 'Breakfast', time: '08:19 AM', method: 'demo', status: 'verified' },
  { id: 'a-3', studentId: '24BCE0918', name: 'Ishita Rao', meal: 'Breakfast', time: '08:41 AM', method: 'demo', status: 'verified' },
  { id: 'a-4', studentId: '24BCE1204', name: 'Nikhil Shetty', meal: 'Breakfast', time: '09:02 AM', method: 'demo', status: 'verified' },
  { id: 'a-5', studentId: '24BCE0776', name: 'Meera Iyer', meal: 'Breakfast', time: '09:15 AM', method: 'demo', status: 'verified' },
];

module.exports = {
  // database connection & storage path
  db,
  dbPath,
  // accounts + sessions (auth.js)
  findUserForLogin,
  getUserById,
  getUserByEmail,
  registerUser,
  createSession,
  deleteSession,
  userForSession,

  // date helpers
  toDateKey,
  addDays,

  // student data
  getMealDefinitions,
  getMealsForDate,
  setMealIntent,
  getHistory,
  summariseHistory,
  historyTrend,
  getNotifications,
  markNotification,
  getPreferences,
  setPreferences,

  // admin placeholders
  messTotals,
  predictions,
  wasteTrend,
  attendanceLog,
  assignFingerprintId,
  enrollStudent,
  recordHardwareScan,
  getLiveStats,
  adminMealSnapshot,
  getRecentActivity,
  getHardwareStatus,
  setHardwareMode,
  recordCapturedFingerprint,
};

let hardwareState = {
  mode: 'verify', // 'verify' | 'enroll'
  lastCapturedId: null,
  updatedAt: new Date().toISOString(),
};

function getHardwareStatus() {
  return { ...hardwareState };
}

function setHardwareMode(mode) {
  const nextMode = mode === 'enroll' ? 'enroll' : 'verify';
  hardwareState.mode = nextMode;
  if (nextMode === 'enroll') {
    hardwareState.lastCapturedId = null;
  }
  hardwareState.updatedAt = new Date().toISOString();
  return { ...hardwareState };
}

function recordCapturedFingerprint(fingerprintId) {
  const parsedId = parseInt(fingerprintId, 10);
  if (isNaN(parsedId)) {
    return { error: 'invalid_fingerprint_id', message: 'fingerprintId must be an integer.' };
  }
  hardwareState.lastCapturedId = parsedId;
  hardwareState.updatedAt = new Date().toISOString();
  return { ok: true, fingerprintId: parsedId, status: { ...hardwareState } };
}

/**
 * Assigns or updates a fingerprintId for a student profile.
 */
function assignFingerprintId(identifier, fingerprintId) {
  if (!identifier) {
    return { error: 'user_not_found', message: 'Student Registration Number not found' };
  }

  const normalizedId = String(identifier).trim().toUpperCase();

  // Find user row by id, student_id, or email (case-insensitive)
  const findUserStmt = db.prepare(`
    SELECT id, name, student_id, fingerprint_id FROM users
    WHERE upper(id) = ? OR upper(student_id) = ? OR lower(email) = ?
  `);
  const userRow = findUserStmt.get(normalizedId, normalizedId, `${normalizedId.toLowerCase()}@smartmess.demo`);

  if (!userRow) {
    return { error: 'user_not_found', message: 'Student Registration Number not found' };
  }

  const parsedFpId = parseInt(fingerprintId, 10);
  if (isNaN(parsedFpId)) {
    return { error: 'invalid_fingerprint_id', message: 'fingerprintId must be an integer.' };
  }

  // Check if fingerprint_id is already assigned to another user
  const existingStmt = db.prepare('SELECT id, name, student_id FROM users WHERE fingerprint_id = ? AND id != ?');
  const existingUser = existingStmt.get(parsedFpId, userRow.id);
  if (existingUser) {
    return {
      error: 'already_assigned',
      message: `Fingerprint ID ${parsedFpId} is already assigned to ${existingUser.name || existingUser.student_id}.`,
    };
  }

  const updateStmt = db.prepare('UPDATE users SET fingerprint_id = ? WHERE id = ?');
  updateStmt.run(parsedFpId, userRow.id);

  const updatedUser = getUserById(userRow.id);
  return { ok: true, user: updatedUser };
}

/**
 * Enrolls a new student on the fly and assigns fingerprintId.
 * Rejects if the student is already enrolled (existing in users table).
 */
function enrollStudent({ studentId, name, fingerprintId }) {
  if (!studentId || !name || fingerprintId === undefined || fingerprintId === null) {
    return { error: 'missing_fields', message: 'studentId, name, and fingerprintId are all required for enrollment.' };
  }

  const normalizedId = String(studentId).trim().toUpperCase();
  const trimmedName = String(name).trim();
  const parsedFpId = parseInt(fingerprintId, 10);

  const nameRegex = /^[A-Za-z\s]+$/;
  const studentIdRegex = /^\d{2}[A-Za-z]{3}\d{4,5}$/;

  if (!nameRegex.test(trimmedName)) {
    return { error: 'invalid_name', message: 'Name must only contain letters and spaces.' };
  }

  if (!studentIdRegex.test(normalizedId)) {
    return {
      error: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
      message: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
    };
  }

  if (isNaN(parsedFpId)) {
    return { error: 'invalid_fingerprint_id', message: 'fingerprintId must be an integer.' };
  }

  // Check if the student already exists in the users table
  const checkUserStmt = db.prepare(`
    SELECT id, name, student_id, fingerprint_id FROM users
    WHERE upper(id) = ? OR upper(student_id) = ?
  `);
  const existingUser = checkUserStmt.get(normalizedId, normalizedId);
  if (existingUser) {
    return { error: 'already_enrolled', message: 'Student is already enrolled.' };
  }

  // Check if fingerprint ID is already assigned to another user
  const existingFpStmt = db.prepare('SELECT id, name, student_id FROM users WHERE fingerprint_id = ?');
  const existingFp = existingFpStmt.get(parsedFpId);
  if (existingFp) {
    return {
      error: 'already_assigned',
      message: `Fingerprint ID ${parsedFpId} is already assigned to ${existingFp.name || existingFp.student_id}.`,
    };
  }

  const todayStr = toDateKey(new Date());
  const email = `${normalizedId.toLowerCase()}@smartmess.demo`;

  const insertUserStmt = db.prepare(`
    INSERT INTO users (id, role, name, email, password_hash, student_id, fingerprint_id, hostel, mess_plan, joined_on)
    VALUES (?, 'student', ?, ?, '', ?, ?, 'General Hostel', 'Full Plan (3 meals)', ?)
  `);
  insertUserStmt.run(
    normalizedId,
    trimmedName,
    email,
    normalizedId,
    parsedFpId,
    todayStr
  );

  const newUser = getUserById(normalizedId);
  return { ok: true, user: newUser };
}

/**
 * Records a hardware scan from an ESP32 reader.
 * Supports payload with fingerprintId (e.g. 1, 2) or studentId.
 * Looks up user by fingerprint_id, resolves active meal, prevents duplicate scans,
 * inserts verified attendance, and returns structured JSON response.
 */
function recordHardwareScan({ studentId, fingerprintId, deviceId }) {
  let userRow = null;
  let parsedFpId = fingerprintId !== undefined && fingerprintId !== null && fingerprintId !== '' ? parseInt(fingerprintId, 10) : null;
  if (isNaN(parsedFpId)) parsedFpId = null;

  // 1. User Resolution by fingerprint_id first, then studentId
  if (parsedFpId !== null) {
    const findByFpStmt = db.prepare(`
      SELECT id, name, student_id, fingerprint_id FROM users WHERE fingerprint_id = ?
    `);
    userRow = findByFpStmt.get(parsedFpId);
  }

  if (!userRow && studentId) {
    const normalizedId = String(studentId).trim().toUpperCase();
    const findUserStmt = db.prepare(`
      SELECT id, name, student_id, fingerprint_id FROM users WHERE id = ? OR student_id = ? OR lower(email) = ?
    `);
    userRow = findUserStmt.get(normalizedId, normalizedId, `${normalizedId.toLowerCase()}@smartmess.demo`);

    if (!userRow) {
      const todayStr = toDateKey(new Date());
      const autoProvisionStmt = db.prepare(`
        INSERT INTO users (id, role, name, email, password_hash, student_id, hostel, mess_plan, joined_on)
        VALUES (?, 'student', ?, ?, '', ?, 'General Hostel', 'Full Plan (3 meals)', ?)
      `);
      autoProvisionStmt.run(normalizedId, normalizedId, `${normalizedId.toLowerCase()}@smartmess.demo`, normalizedId, todayStr);
      userRow = { id: normalizedId, name: normalizedId, student_id: normalizedId, fingerprint_id: null };
    }
  }

  if (!userRow) {
    return {
      status: 'unregistered',
      message: parsedFpId !== null
        ? `Fingerprint ID ${parsedFpId} is not assigned to any student profile.`
        : 'Student ID or Fingerprint ID is required.',
      fingerprintId: parsedFpId,
      deviceId: deviceId || 'ESP32_GATE',
    };
  }

  const regNo = userRow.student_id || userRow.id;
  const name = userRow.name || regNo;

  // 2. Active Meal Resolution
  const nowMin = minutesNow();
  const listMealsStmt = db.prepare('SELECT * FROM meals ORDER BY sort_order');
  const allMeals = listMealsStmt.all(); // breakfast, lunch, dinner
  let activeMeal = allMeals.find((m) => nowMin >= m.start_min && nowMin <= m.end_min);

  if (!activeMeal) {
    const lunch = allMeals.find((m) => m.id === 'lunch');
    const dinner = allMeals.find((m) => m.id === 'dinner');
    const lunchStart = lunch ? lunch.start_min : 750;
    const dinnerStart = dinner ? dinner.start_min : 1155;

    if (nowMin < lunchStart) {
      activeMeal = allMeals.find((m) => m.id === 'breakfast') || allMeals[0];
    } else if (nowMin < dinnerStart) {
      activeMeal = lunch || allMeals[1] || allMeals[0];
    } else {
      activeMeal = dinner || allMeals[allMeals.length - 1];
    }
  }
  const mealId = activeMeal.id;
  const dateKey = toDateKey(new Date());

  // 3. Duplicate Check
  const checkAttendanceStmt = db.prepare(`
    SELECT status, verified_at, source FROM attendance
    WHERE student_id = ? AND meal_date = ? AND meal_id = ?
  `);
  const existingAttendance = checkAttendanceStmt.get(userRow.id, dateKey, mealId);

  if (existingAttendance && existingAttendance.status === 'verified') {
    return {
      status: 'already_marked',
      message: `Duplicate entry detected for ${name}`,
      name,
      regNo,
      studentId: regNo,
      userId: userRow.id,
      fingerprintId: userRow.fingerprint_id || parsedFpId,
      meal: mealId,
      mealName: activeMeal.name,
      date: dateKey,
      verifiedAt: existingAttendance.verified_at,
      deviceId: deviceId || 'ESP32_GATE',
    };
  }

  // 4. Insert Verified Attendance & Check Walk-in status
  const verifiedAt = new Date().toISOString();
  const upsertAttendanceStmt = db.prepare(`
    INSERT INTO attendance (student_id, meal_date, meal_id, status, source, verified_at, device_id)
    VALUES (?, ?, ?, 'verified', 'fingerprint', ?, ?)
    ON CONFLICT (student_id, meal_date, meal_id)
    DO UPDATE SET status = 'verified', source = 'fingerprint', verified_at = excluded.verified_at, device_id = excluded.device_id
  `);
  upsertAttendanceStmt.run(userRow.id, dateKey, mealId, verifiedAt, deviceId || 'ESP32_GATE');

  const checkIntentStmt = db.prepare(`
    SELECT intent FROM meal_intents WHERE student_id = ? AND meal_date = ? AND meal_id = ?
  `);
  const intentRow = checkIntentStmt.get(userRow.id, dateKey, mealId);
  const isWalkIn = !(intentRow && intentRow.intent === 'attending');

  return {
    status: 'success',
    message: `Attendance verified for ${name}`,
    name,
    regNo,
    studentId: regNo,
    userId: userRow.id,
    fingerprintId: userRow.fingerprint_id || parsedFpId,
    meal: mealId,
    mealName: activeMeal.name,
    date: dateKey,
    isWalkIn,
    verifiedAt,
    deviceId: deviceId || 'ESP32_GATE',
  };
}

function formatTimeAgo(isoString) {
  if (!isoString) return 'Just now';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / (60 * 1000));
  if (diffMins < 1) return 'Just now';
  if (diffMins === 1) return '1 min ago';
  if (diffMins < 60) return `${diffMins} mins ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
}

function getRecentActivity(limit = 6) {
  try {
    const stmt = db.prepare(`
      SELECT
        a.student_id AS studentId,
        COALESCE(u.student_id, u.id, a.student_id) AS studentDisplayId,
        COALESCE(u.name, a.student_id) AS name,
        a.meal_date AS mealDate,
        a.meal_id AS mealId,
        m.name AS mealName,
        a.status AS status,
        a.source AS source,
        a.verified_at AS verifiedAt,
        COALESCE(i.intent, 'none') AS intent
      FROM attendance a
      JOIN meals m ON m.id = a.meal_id
      LEFT JOIN users u ON u.id = a.student_id
      LEFT JOIN meal_intents i ON i.student_id = a.student_id AND i.meal_date = a.meal_date AND i.meal_id = a.meal_id
      WHERE a.status = 'verified'
      ORDER BY a.verified_at DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit);

    if (rows.length > 0) {
      return rows.map((r, index) => {
        const isWalkIn = r.intent !== 'attending';
        const mealLabel = r.mealName || r.mealId;
        const studentTag = r.studentDisplayId || r.studentId;
        const timeAgo = formatTimeAgo(r.verifiedAt);
        
        return {
          id: `act-db-${index}-${r.verifiedAt}`,
          description: `Student ${studentTag} verified for ${mealLabel} (${isWalkIn ? 'Walk-in' : 'Booked'})`,
          time: timeAgo,
          variant: isWalkIn ? 'walkin' : 'booked',
          dotColor: isWalkIn ? '#3b82f6' : 'var(--success-color)',
        };
      });
    }
  } catch (err) {
    console.error('Error fetching recent activity from db:', err.message);
  }

  return [
    { id: 'act-demo-1', description: 'Student 24BCE1187 verified for Breakfast (Booked)', time: '8 mins ago', variant: 'booked', dotColor: 'var(--success-color)' },
    { id: 'act-demo-2', description: 'Student 24BCE1042 verified for Breakfast (Booked)', time: '15 mins ago', variant: 'booked', dotColor: 'var(--success-color)' },
    { id: 'act-demo-3', description: 'Student 24BCE7998 verified for Lunch (Walk-in)', time: '32 mins ago', variant: 'walkin', dotColor: '#3b82f6' },
  ];
}

function getLiveStats(customMinutes, customDate) {
  const todayKey = customDate || toDateKey(new Date());
  const nowMin = customMinutes !== undefined && customMinutes !== null ? Number(customMinutes) : minutesNow();
  const meals = adminMealSnapshot(todayKey, nowMin);

  // Dynamic active meal resolution based on local clock windows:
  // Sort meals by startMin
  const sorted = [...meals].sort((a, b) => a.startMin - b.startMin);

  let currentMeal = null;
  // 1. Is any meal currently in its serving window?
  const activeServing = sorted.find((m) => nowMin >= m.startMin && nowMin <= m.endMin);
  if (activeServing) {
    currentMeal = activeServing;
  } else {
    // 2. Meal transition windows:
    // Before lunch starts (e.g. before 12:30 PM):
    // Active meal is Breakfast (Upcoming before 7:00 AM, Completed after 9:00 AM)
    const lunch = sorted.find((m) => m.id === 'lunch');
    const lunchStart = lunch ? lunch.startMin : 750;
    const dinner = sorted.find((m) => m.id === 'dinner');
    const dinnerStart = dinner ? dinner.startMin : 1155;

    if (nowMin < lunchStart) {
      currentMeal = sorted.find((m) => m.id === 'breakfast') || sorted[0];
    } else if (nowMin < dinnerStart) {
      // Between lunch start (12:30 PM) and dinner start (19:15 PM):
      // Active meal is Lunch (Serving until 14:15, Completed 14:15-19:15)
      currentMeal = lunch || sorted[1] || sorted[0];
    } else {
      // At or after dinner start (19:15 PM onwards):
      // Active meal is Dinner
      currentMeal = dinner || sorted[sorted.length - 1];
    }
  }

  const currentIndex = sorted.findIndex((m) => m.id === currentMeal.id);
  const nextMeal = sorted[(currentIndex + 1) % sorted.length] || sorted[0];

  const fullDayPredicted = meals.reduce((sum, m) => sum + m.predicted, 0);
  const fullDayConfirmed = meals.reduce((sum, m) => sum + m.confirmed, 0);
  const fullDayActual = meals.reduce((sum, m) => sum + m.actual, 0);
  const fullDayAccuracy = (fullDayConfirmed > 0 && fullDayActual > 0)
    ? Math.min(100, (fullDayActual / fullDayConfirmed) * 100)
    : 0;

  const currentMealPredicted = currentMeal.predicted || MEAL_BASELINES[currentMeal.id] || 0;
  const currentMealAccuracy = (currentMeal.confirmed > 0 && currentMeal.actual > 0)
    ? Math.min(100, (currentMeal.actual / currentMeal.confirmed) * 100)
    : 0;

  const nextMealPredicted = nextMeal.predicted || MEAL_BASELINES[nextMeal.id] || 0;

  return {
    currentMeal: {
      id: currentMeal.id,
      name: currentMeal.name,
      label: `${currentMeal.name} (${currentMeal.time})`,
      time: currentMeal.time,
      status: currentMeal.status,
      predicted: currentMealPredicted,
      confirmed: currentMeal.confirmed,
      actual: currentMeal.actual,
      accuracy: currentMealAccuracy,
    },
    nextMeal: {
      id: nextMeal.id,
      name: nextMeal.name,
      label: `${nextMeal.name} (${nextMeal.time})`,
      time: nextMeal.time,
      predicted: nextMealPredicted,
      confirmed: nextMeal.confirmed,
      recommended: Math.round((nextMeal.confirmed || nextMealPredicted) * 0.98),
    },
    fullDay: {
      predicted: fullDayPredicted,
      confirmed: fullDayConfirmed,
      actual: fullDayActual,
      accuracy: fullDayAccuracy,
    },
    summary: {
      predicted: currentMealPredicted,
      confirmed: currentMeal.confirmed,
      actualSoFar: currentMeal.actual,
      accuracy: currentMealAccuracy,
    },
    recentActivity: getRecentActivity(6),
    meals,
    date: todayKey,
  };
}

