/**
 * Centralized API & Service URL Configuration for Mess Frontend
 *
 * In production (e.g. Vercel), VITE_API_URL is configured to point directly to the
 * backend (e.g. https://marvelous-playfulness-production-eba9.up.railway.app).
 *
 * In local development, if VITE_API_URL is not set, API_BASE_URL defaults to an empty string '',
 * allowing relative fetch calls (e.g. fetch(`${API_BASE_URL}/api/...`)) to seamlessly resolve
 * against the local Vite dev server proxy (target: http://localhost:5002) in vite.config.js.
 *
 * SOCKET_URL and HARDWARE_API_URL default to API_BASE_URL in production so they do not
 * fall back to localhost:5002 and trigger Mixed Content or connection errors.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

export const SOCKET_URL = (
  import.meta.env.VITE_SOCKET_URL ||
  API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? window.location.origin
    : 'http://localhost:5002')
).replace(/\/+$/, '');

export const HARDWARE_API_URL = (
  import.meta.env.VITE_HARDWARE_API_URL ||
  API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.protocol === 'https:'
    ? window.location.origin
    : 'http://localhost:5002')
).replace(/\/+$/, '');
