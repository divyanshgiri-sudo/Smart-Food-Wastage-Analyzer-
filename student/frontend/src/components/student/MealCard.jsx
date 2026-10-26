/**
 * One meal, from the student's point of view.
 *
 * The card keeps intention and attendance in two clearly separated sections,
 * because they answer different questions: "what did I say?" versus "what did
 * the mess record?".
 */

import MealIntentSelector from './MealIntentSelector';
import { AttendanceBadge, IntentBadge, MealStatusBadge } from './StatusBadges';
import { formatDate, formatTime, todayKey } from '../../utils/format';

export default function MealCard({ meal, onSelect, saving }) {
  if (!meal) return null;

  const mealId = meal.id || 'unknown';
  const mealDate = meal.date || todayKey();
  const showAttendance = meal.status !== 'upcoming' || (meal.attendanceStatus && meal.attendanceStatus !== 'none');
  const menuHeading = mealDate === todayKey() ? "Today's menu" : `Menu · ${formatDate(mealDate)}`;
  const menuItems = Array.isArray(meal.menu) ? meal.menu : [];

  return (
    <article className="meal-card" data-intent={meal.studentIntent || 'none'} aria-labelledby={`meal-${mealDate}-${mealId}`}>
      <header className="meal-card-head">
        <div>
          <h3 className="meal-name" id={`meal-${mealDate}-${mealId}`}>{meal.name || 'Meal'}</h3>
          <p className="meal-time">{meal.time || ''}</p>
        </div>
        <MealStatusBadge status={meal.status || 'upcoming'} />
      </header>

      <div className="meal-section">
        <p className="meal-label" id={`menu-${mealDate}-${mealId}`}>{menuHeading}</p>
        <ul className="menu-list" aria-labelledby={`menu-${mealDate}-${mealId}`}>
          {menuItems.length > 0 ? (
            menuItems.map((item, idx) => (
              <li key={`${item}-${idx}`} className="menu-item">{item}</li>
            ))
          ) : (
            <li className="menu-item menu-item-empty">Menu not published yet</li>
          )}
        </ul>
      </div>

      <div className="meal-section">
        <div className="meal-status-row" style={{ marginBottom: 10 }}>
          <p className="meal-label" style={{ marginBottom: 0 }}>Your response</p>
          <IntentBadge intent={meal.studentIntent || 'none'} />
        </div>
        <MealIntentSelector meal={meal} onSelect={onSelect} saving={saving} />
      </div>

      {showAttendance && (
        <div className="meal-section">
          <div className="meal-status-row">
            <p className="meal-label" style={{ marginBottom: 0 }}>Attendance at the mess</p>
            <AttendanceBadge status={meal.attendanceStatus || 'none'} source={meal.attendanceSource} />
          </div>
          <p className="cutoff-note">
            <span aria-hidden="true">👆</span>
            {meal.attendanceStatus === 'verified'
              ? `Recorded ${formatTime(meal.attendanceVerifiedAt)}. Biometric scan recorded at mess entrance.`
              : 'Attendance is recorded at the mess entrance. Nothing has been recorded for this meal.'}
          </p>
        </div>
      )}
    </article>
  );
}
