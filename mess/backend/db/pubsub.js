/**
 * PostgreSQL Pub/Sub using LISTEN and NOTIFY for real-time inter-service synchronization.
 *
 * Allows Mess Backend and Student Backend to communicate in real-time across separate
 * hosting containers via the shared PostgreSQL database.
 */

const { Client } = require('pg');
const { db } = require('./index');

let listenerClient = null;
let reconnectTimer = null;
let isClosing = false;

/**
 * Broadcasts a payload to a PostgreSQL notification channel.
 * Uses SELECT pg_notify($1, $2) to safely handle strings and objects without SQL injection.
 */
async function notify(channel, payload) {
  if (!process.env.DATABASE_URL) return;

  const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);

  try {
    if (db && db.pool) {
      await db.pool.query('SELECT pg_notify($1, $2)', [channel, payloadString]);
    } else {
      const isLocal = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');
      const tempClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      });
      await tempClient.connect();
      await tempClient.query('SELECT pg_notify($1, $2)', [channel, payloadString]);
      await tempClient.end();
    }
  } catch (err) {
    console.warn(`[PostgreSQL NOTIFY ${channel} warning]:`, err.message);
  }
}

/**
 * Starts a persistent listener on one or more PostgreSQL notification channels.
 * Automatically handles reconnection if the database restarts or drops the socket.
 *
 * @param {string|string[]} channels Channel name(s) to listen on (e.g. ['intent_updates', 'hardware_scans'])
 * @param {function(string, any)} onNotification Callback invoked on every received message: (channel, payload)
 * @returns {{ close: function }} Control object to terminate the listener
 */
function initListener(channels, onNotification) {
  if (!process.env.DATABASE_URL) {
    console.log('[PostgreSQL LISTEN] DATABASE_URL not set; skipping LISTEN.');
    return { close: () => {} };
  }

  isClosing = false;
  const channelList = Array.isArray(channels) ? channels : [channels];
  const isLocal = process.env.DATABASE_URL.includes('localhost') || process.env.DATABASE_URL.includes('127.0.0.1');

  function cleanup() {
    if (listenerClient) {
      try {
        listenerClient.removeAllListeners();
        listenerClient.end().catch(() => {});
      } catch {}
      listenerClient = null;
    }
  }

  function scheduleReconnect() {
    if (isClosing || reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 4000);
  }

  async function connect() {
    if (isClosing) return;
    cleanup();

    try {
      listenerClient = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      });

      listenerClient.on('notification', (msg) => {
        let parsed = msg.payload;
        try {
          parsed = JSON.parse(msg.payload);
        } catch {
          // Keep as raw string if not JSON
        }
        if (typeof onNotification === 'function') {
          try {
            onNotification(msg.channel, parsed);
          } catch (callbackErr) {
            console.error(`[PostgreSQL LISTEN ${msg.channel} handler error]:`, callbackErr);
          }
        }
      });

      listenerClient.on('error', (err) => {
        console.warn('[PostgreSQL LISTEN client error]:', err.message);
        cleanup();
        scheduleReconnect();
      });

      listenerClient.on('end', () => {
        if (!isClosing) {
          cleanup();
          scheduleReconnect();
        }
      });

      await listenerClient.connect();
      for (const ch of channelList) {
        await listenerClient.query(`LISTEN ${ch}`);
      }
      console.log(`[PostgreSQL LISTEN] Actively listening on: ${channelList.join(', ')}`);
    } catch (err) {
      console.warn('[PostgreSQL LISTEN connection failed, retrying in 4s]:', err.message);
      cleanup();
      scheduleReconnect();
    }
  }

  connect();

  return {
    close() {
      isClosing = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      cleanup();
    },
  };
}

module.exports = { notify, initListener };
