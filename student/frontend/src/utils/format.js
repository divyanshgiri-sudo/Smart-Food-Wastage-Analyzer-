/** Date and label helpers shared by both portals. */

const MEAL_ORDER = { breakfast: 0, lunch: 1, dinner: 2 };

export function initials(name = '') {
  if (!name || typeof name !== 'string') return 'S';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'S';
  const inits = parts
    .slice(0, 2)
    .map((part) => (part && part[0] ? part[0].toUpperCase() : ''))
    .join('');
  return inits || 'S';
}

export function greeting(date = new Date()) {
  try {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const hour = isNaN(d.getTime()) ? 12 : d.getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  } catch {
    return 'Good day';
  }
}

/** "Mon, 24 Aug" — compact and unambiguous. */
export function formatDate(value) {
  if (!value) return '';
  try {
    const date = typeof value === 'string' ? parseDateKey(value) : (value instanceof Date ? value : new Date(value));
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

export function formatLongDate(value) {
  if (!value) return '';
  try {
    const date = typeof value === 'string' ? parseDateKey(value) : (value instanceof Date ? value : new Date(value));
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

/** "22 July 2024" — used where the year matters, such as join dates. */
export function formatFullDate(value) {
  if (!value) return '';
  try {
    const date = typeof value === 'string' ? parseDateKey(value) : (value instanceof Date ? value : new Date(value));
    if (!date || isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return '';
  }
}

export function formatTime(iso) {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

/** Today as a YYYY-MM-DD key, matching the keys the API returns. */
export function todayKey(date = new Date()) {
  try {
    const d = date instanceof Date ? date : new Date(date || Date.now());
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const y = validDate.getFullYear();
    const m = String(validDate.getMonth() + 1).padStart(2, '0');
    const day = String(validDate.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
}

/** Parses a YYYY-MM-DD key in local time (avoids the UTC shift of new Date(str)). */
export function parseDateKey(key) {
  if (!key || typeof key !== 'string') return new Date();
  try {
    const parts = key.split('-').map(Number);
    if (parts.length < 3 || parts.some(isNaN)) {
      const fallback = new Date(key);
      return isNaN(fallback.getTime()) ? new Date() : fallback;
    }
    const [y, m, d] = parts;
    return new Date(y, m - 1, d);
  } catch {
    return new Date();
  }
}

export function relativeTime(iso) {
  if (!iso) return '';
  try {
    const date = new Date(iso);
    const then = date.getTime();
    if (isNaN(then)) return '';
    const diffMin = Math.round((Date.now() - then) / 60000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;

    const diffHours = Math.round(diffMin / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;

    const diffDays = Math.round(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(date);
  } catch {
    return '';
  }
}

export function sortMeals(meals) {
  if (!Array.isArray(meals)) return [];
  return [...meals].sort((a, b) => (MEAL_ORDER[a?.id] ?? 99) - (MEAL_ORDER[b?.id] ?? 99));
}
