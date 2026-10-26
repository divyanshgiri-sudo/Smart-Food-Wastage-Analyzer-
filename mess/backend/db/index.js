/**
 * Database connection for Mess Admin Backend.
 *
 * Supports PostgreSQL via process.env.DATABASE_URL, with fallback to
 * local SQLite when running locally or in development without
 * a PostgreSQL instance.
 */

const fs = require('fs');
const path = require('path');

const schemaFile = path.join(__dirname, 'schema.sql');

if (process.env.DATABASE_URL) {
  const { createPostgresDb } = require('./postgres');
  module.exports = createPostgresDb(process.env.DATABASE_URL, schemaFile);
} else {
  const { DatabaseSync } = require('node:sqlite');

  // Default database path: fallback to local student backend db if in monorepo, or local data folder
  const monorepoStudentDb = path.resolve(__dirname, '../../../student/backend/data/smartmess.db');
  const localDefaultDb = path.resolve(__dirname, '..', 'data', 'smartmess.db');
  const DEFAULT_PATH = fs.existsSync(monorepoStudentDb) ? monorepoStudentDb : localDefaultDb;

  const rawPath = process.env.DB_PATH || DEFAULT_PATH;
  const dbPath = (rawPath === ':memory:' || path.isAbsolute(rawPath))
    ? rawPath
    : path.resolve(process.cwd(), rawPath);

  if (dbPath !== ':memory:') {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  }

  const rawDb = new DatabaseSync(dbPath);

  const db = {
    isPostgres: false,
    exec(sql) {
      return rawDb.exec(sql);
    },
    prepare(sql) {
      const stmt = rawDb.prepare(sql);
      return {
        get(...args) {
          return stmt.get(...args) || undefined;
        },
        all(...args) {
          return stmt.all(...args);
        },
        run(...args) {
          const res = stmt.run(...args);
          return {
            changes: res.changes,
            lastInsertRowid: res.lastInsertRowid,
          };
        },
      };
    },
    pragma(sql) {
      try {
        rawDb.exec(`PRAGMA ${sql};`);
      } catch {
        // PRAGMAs non-fatal if unsupported in memory mode
      }
    },
    transaction(fn) {
      return (...args) => {
        rawDb.exec('BEGIN IMMEDIATE;');
        try {
          const result = fn(...args);
          rawDb.exec('COMMIT;');
          return result;
        } catch (err) {
          try {
            rawDb.exec('ROLLBACK;');
          } catch (_) {}
          throw err;
        }
      };
    },
  };

  // WAL lets dashboard keep reading while concurrent backends write.
  // busy_timeout (5000ms) waits for locks to clear when concurrent backends boot.
  if (dbPath !== ':memory:') {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
  }
  db.pragma('foreign_keys = ON');

  // Apply schema (CREATE ... IF NOT EXISTS)
  if (fs.existsSync(schemaFile)) {
    db.exec(fs.readFileSync(schemaFile, 'utf8'));
  }

  // Migrations
  try { db.exec('ALTER TABLE users ADD COLUMN fingerprint_id INTEGER;'); } catch (err) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_fingerprint_id ON users (fingerprint_id) WHERE fingerprint_id IS NOT NULL;'); } catch (err) {}
  try { db.exec('ALTER TABLE users ADD COLUMN email TEXT;'); } catch (err) {}
  try { db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);'); } catch (err) {}
  try { db.exec('ALTER TABLE users ADD COLUMN hostel TEXT;'); } catch (err) {}
  try { db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'student';"); } catch (err) {}

  module.exports = { db, dbPath };
}
