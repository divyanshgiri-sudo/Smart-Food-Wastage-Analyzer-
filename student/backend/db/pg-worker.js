/**
 * Background worker thread for synchronous PostgreSQL queries.
 *
 * Runs inside node:worker_threads to bridge async pg queries to the
 * synchronous query API expected by the application.
 */

const { workerData } = require('node:worker_threads');
const { Pool, types } = require('pg');

// Parse BIGINT (20) and NUMERIC (1700) as numbers to match SQLite return types
types.setTypeParser(20, (val) => val === null ? null : parseInt(val, 10));
types.setTypeParser(1700, (val) => val === null ? null : parseFloat(val));

const connectionString = workerData.connectionString;
const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const i32 = new Int32Array(workerData.sab);
const port = workerData.port;

let dedicatedClient = null;

async function getClient() {
  if (!dedicatedClient) {
    dedicatedClient = await pool.connect();
    dedicatedClient.on('error', (err) => {
      console.error('[pg-worker client error]:', err.message);
      dedicatedClient = null;
    });
  }
  return dedicatedClient;
}

port.on('message', async (msg) => {
  try {
    const client = await getClient();
    if (msg.type === 'query') {
      const res = await client.query(msg.sql, msg.params);
      port.postMessage({ id: msg.id, ok: true, rows: res.rows || [], rowCount: res.rowCount || 0 });
    } else if (msg.type === 'exec') {
      await client.query(msg.sql);
      port.postMessage({ id: msg.id, ok: true });
    } else if (msg.type === 'ping') {
      await client.query('SELECT 1');
      port.postMessage({ id: msg.id, ok: true });
    } else {
      port.postMessage({ id: msg.id, ok: false, error: `Unknown query type: ${msg.type}` });
    }
  } catch (err) {
    port.postMessage({ id: msg.id, ok: false, error: err.message, stack: err.stack });
  } finally {
    Atomics.store(i32, 0, 1);
    Atomics.notify(i32, 0, 1);
  }
});
