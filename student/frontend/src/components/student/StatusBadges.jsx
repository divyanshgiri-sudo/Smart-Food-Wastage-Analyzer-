/**
 * Status badges for the student portal.
 *
 * Three separate ideas that must never be confused with each other:
 *   IntentBadge      — what the student SAID they would do
 *   AttendanceBadge  — what the system RECORDED at the mess
 *   MealStatusBadge  — where the meal itself is in the day
 *
 * Every badge carries an icon and a word, so colour is never the only cue.
 */

const INTENT_MAP = {
  attending: { className: 'badge-positive', icon: '✓', label: 'Attending' },
  not_attending: { className: 'badge-neutral', icon: '✕', label: 'Not attending' },
  none: { className: 'badge-pending', icon: '?', label: 'Not responded' },
};

const ATTENDANCE_MAP = {
  verified: { className: 'badge-positive', icon: '✓', label: 'Recorded' },
  not_verified: { className: 'badge-pending', icon: '○', label: 'Not yet recorded' },
  none: { className: 'badge-neutral', icon: '—', label: 'No record' },
};

const MEAL_STATUS_MAP = {
  upcoming: { className: 'badge-info', icon: '◔', label: 'Upcoming' },
  serving: { className: 'badge-positive', icon: '●', label: 'Serving now' },
  completed: { className: 'badge-neutral', icon: '✓', label: 'Finished' },
};

function Badge({ config = {}, srPrefix = '' }) {
  const className = config.className || 'badge-neutral';
  const icon = config.icon || '—';
  const label = config.label || '';

  return (
    <span className={`badge ${className}`}>
      <span className="badge-icon" aria-hidden="true">{icon}</span>
      {srPrefix && <span className="sr-only">{srPrefix}: </span>}
      {label}
    </span>
  );
}

export function IntentBadge({ intent }) {
  const config = INTENT_MAP[intent] || INTENT_MAP.none;
  return <Badge config={config} srPrefix="Your response" />;
}

/**
 * `past` switches the wording for meals whose window has closed.
 * `source` is 'demo' for seeded prototype data and would be 'fingerprint' once
 * the ESP32 endpoint writes real scans. The wording never claims a fingerprint
 * scan happened unless the backend says one did.
 */
export function AttendanceBadge({ status, source, past = false }) {
  const config = ATTENDANCE_MAP[status] || ATTENDANCE_MAP.none;

  let label = config.label;
  if (status === 'verified' && source === 'fingerprint') label = 'Verified by fingerprint';
  // "Not yet recorded" only makes sense while the meal can still be attended.
  else if (status === 'not_verified' && past) label = 'Not recorded';

  return <Badge config={{ ...config, label }} srPrefix="Attendance" />;
}

export function MealStatusBadge({ status }) {
  const config = MEAL_STATUS_MAP[status] || MEAL_STATUS_MAP.upcoming;
  return <Badge config={config} srPrefix="Meal status" />;
}

export { INTENT_MAP, ATTENDANCE_MAP, MEAL_STATUS_MAP };
