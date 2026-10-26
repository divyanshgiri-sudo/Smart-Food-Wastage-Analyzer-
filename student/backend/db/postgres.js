/**
 * PostgreSQL Database Adapter for Smart Food Wastage Analyser.
 *
 * Implements the synchronous database interface (prepare, exec, pragma, transaction)
 * on top of node-postgres (pg) using worker_threads and SharedArrayBuffer / Atomics.
 * This guarantees zero architectural changes to existing synchronous store accessors.
 */

const fs = require('fs');
const path = require('path');
const { Worker, MessageChannel, receiveMessageOnPort } = require('node:worker_threads');
const { Pool, types } = require('pg');

types.setTypeParser(20, (val) => val === null ? null : parseInt(val, 10));
types.setTypeParser(1700, (val) => val === null ? null : parseFloat(val));

function replaceOutsideQuotes(str, regex, replacer) {
  const parts = [];
  let lastIndex = 0;
  const quoteRegex = /'(?:''|[^'])*'/g;
  let match;
  while ((match = quoteRegex.exec(str)) !== null) {
    const before = str.slice(lastIndex, match.index);
    parts.push(before.replace(regex, replacer));
    parts.push(match[0]);
    lastIndex = match.index + match[0].length;
  }
  parts.push(str.slice(lastIndex).replace(regex, replacer));
  return parts.join('');
}

function normalizeSql(rawSql, args) {
  let sql = rawSql.trim();

  // 1. Convert INSERT OR IGNORE INTO to INSERT INTO ... ON CONFLICT DO NOTHING
  if (/INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql)) {
    sql = sql.replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(sql)) {
      if (sql.endsWith(';')) {
        sql = sql.slice(0, -1) + ' ON CONFLICT DO NOTHING;';
      } else {
        sql += ' ON CONFLICT DO NOTHING';
      }
    }
  }

  // 2. Convert datetime('now') to CURRENT_TIMESTAMP
  sql = sql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');

  // 3. Convert strftime('%w', X) to EXTRACT(DOW FROM (X)::date)::text
  sql = sql.replace(/strftime\('%w',\s*([^)]+)\)/gi, 'EXTRACT(DOW FROM ($1)::date)::text');

  // 4. Strip PRAGMA
  if (/^PRAGMA\s+/i.test(sql)) {
    return { sql: 'SELECT 1;', params: [] };
  }

  // 5. Handle named parameters @name outside quotes
  const namedParams = [];
  const transformedWithNamed = replaceOutsideQuotes(sql, /@([a-zA-Z0-9_]+)/g, (_, name) => {
    let idx = namedParams.indexOf(name);
    if (idx === -1) {
      namedParams.push(name);
      idx = namedParams.length - 1;
    }
    return '$' + (idx + 1);
  });

  if (namedParams.length > 0) {
    sql = transformedWithNamed;
    const argObj = (args && typeof args[0] === 'object' && args[0] !== null) ? args[0] : {};
    const params = namedParams.map((name) => argObj[name] !== undefined ? argObj[name] : null);
    return { sql, params };
  }

  // 6. Handle positional parameters ? outside quotes
  let paramIndex = 0;
  sql = replaceOutsideQuotes(sql, /\?/g, () => '$' + (++paramIndex));

  let params = [];
  if (args.length === 1 && Array.isArray(args[0])) {
    params = args[0];
  } else if (args.length > 0) {
    params = Array.from(args);
  }
  params = params.map((v) => v === undefined ? null : v);

  return { sql, params };
}

function createPostgresDb(connectionString, schemaPath) {
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  // Async pool for direct promise queries
  const pool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });

  // Setup worker thread for synchronous query execution
  const sab = new SharedArrayBuffer(4);
  const i32 = new Int32Array(sab);
  const { port1, port2 } = new MessageChannel();

  const worker = new Worker(path.join(__dirname, 'pg-worker.js'), {
    workerData: {
      connectionString,
      sab,
      port: port2,
    },
    transferList: [port2],
  });

  let msgId = 0;

  function executeSync(type, sql, params = []) {
    Atomics.store(i32, 0, 0);
    const id = ++msgId;
    port1.postMessage({ id, type, sql, params });
    Atomics.wait(i32, 0, 0);
    const msg = receiveMessageOnPort(port1);
    if (!msg || !msg.message) {
      throw new Error('No response from PostgreSQL worker');
    }
    const res = msg.message;
    if (!res.ok) {
      const err = new Error(res.error);
      if (res.stack) err.stack = res.stack;
      throw err;
    }
    return res;
  }

  const db = {
    isPostgres: true,
    pool,
    query(rawSql, params = []) {
      const norm = normalizeSql(rawSql, params);
      return pool.query(norm.sql, norm.params);
    },
    exec(rawSql) {
      let cleanSql = rawSql
        .replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')
        .replace(/PRAGMA[^;]+;/gi, '');
      if (!cleanSql.trim()) return;
      return executeSync('exec', cleanSql);
    },
    prepare(rawSql) {
      return {
        get(...args) {
          const { sql, params } = normalizeSql(rawSql, args);
          const res = executeSync('query', sql, params);
          return res.rows[0] || undefined;
        },
        all(...args) {
          const { sql, params } = normalizeSql(rawSql, args);
          const res = executeSync('query', sql, params);
          return res.rows || [];
        },
        run(...args) {
          const { sql, params } = normalizeSql(rawSql, args);
          const res = executeSync('query', sql, params);
          return {
            changes: res.rowCount || 0,
            lastInsertRowid: 0,
          };
        },
      };
    },
    pragma(sql) {
      // PRAGMAs are SQLite-specific; safely no-op in PostgreSQL
    },
    transaction(fn) {
      return (...args) => {
        executeSync('exec', 'BEGIN;');
        try {
          const result = fn(...args);
          executeSync('exec', 'COMMIT;');
          return result;
        } catch (err) {
          try {
            executeSync('exec', 'ROLLBACK;');
          } catch (_) {}
          throw err;
        }
      };
    },
    close() {
      worker.terminate();
      return pool.end();
    },
  };

  // Ping database to verify connection
  try {
    executeSync('ping');
    console.log('[PostgreSQL] Connected successfully to shared database instance via DATABASE_URL.');
  } catch (err) {
    console.error('[PostgreSQL Error] Unable to connect to DATABASE_URL:', err.message);
    throw err;
  }

  // Schema initialization
  if (schemaPath && fs.existsSync(schemaPath)) {
    try {
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      db.exec(schemaSql);
      console.log('[PostgreSQL] Base schema initialized (tables: users, meals, menu_items, meal_intents, attendance, notifications, preferences, sessions, ml_predictions).');
    } catch (err) {
      console.warn('[PostgreSQL schema init warning]:', err.message);
    }
  }

  // Apply migrations for columns / unique indexes
  const migrations = [
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS fingerprint_id INTEGER;',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_fingerprint_id ON users (fingerprint_id) WHERE fingerprint_id IS NOT NULL;',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);',
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS hostel TEXT;',
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'student';",
  ];

  migrations.forEach((migration) => {
    try {
      db.exec(migration);
    } catch (err) {
      // Non-fatal if index or column already exists
    }
  });

  return { db, dbPath: 'postgres' };
}

module.exports = { createPostgresDb, normalizeSql };
