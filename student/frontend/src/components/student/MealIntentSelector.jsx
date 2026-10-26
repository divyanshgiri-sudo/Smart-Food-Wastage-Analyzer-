/**
 * The core interaction of the student portal: telling the mess whether you are
 * eating this meal.
 *
 * Three display modes:
 *   • no answer yet  -> the two choice buttons
 *   • answered       -> a confirmation panel plus an explicit "Change response"
 *   • cutoff passed  -> a read-only explanation of why the choice is locked
 *
 * Changing an existing answer is deliberately two steps so a mis-tap on a phone
 * cannot silently flip a saved response.
 */

import { useEffect, useState } from 'react';

export default function MealIntentSelector({ meal, onSelect, saving }) {
  const [editing, setEditing] = useState(false);

  if (!meal) return null;

  const studentIntent = meal.studentIntent || 'none';
  const hasResponded = studentIntent !== 'none';
  const mealName = meal.name || 'Meal';
  const cutoffLabel = meal.cutoffLabel || '';

  // Collapse the editor again whenever a new answer arrives from the server.
  useEffect(() => {
    setEditing(false);
  }, [studentIntent]);

  async function choose(intent) {
    if (intent === studentIntent) {
      setEditing(false);
      return;
    }
    if (typeof onSelect === 'function') {
      await onSelect(intent);
    }
  }

  if (!meal.intentOpen) {
    return (
      <div className="closed-note">
        <span aria-hidden="true">🔒</span>
        <span>
          {hasResponded
            ? `Responses closed at ${cutoffLabel}. Your answer was recorded.`
            : `Responses closed at ${cutoffLabel}. You did not respond to this meal.`}
        </span>
      </div>
    );
  }

  const showButtons = !hasResponded || editing;

  if (showButtons) {
    return (
      <div>
        <div
          className="intent-group"
          role="group"
          aria-label={`Will you attend ${mealName}?`}
        >
          <button
            type="button"
            className="intent-btn intent-yes"
            aria-pressed={studentIntent === 'attending'}
            disabled={saving}
            onClick={() => choose('attending')}
          >
            {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : <span aria-hidden="true">✓</span>}
            I&apos;m attending
          </button>
          <button
            type="button"
            className="intent-btn intent-no"
            aria-pressed={studentIntent === 'not_attending'}
            disabled={saving}
            onClick={() => choose('not_attending')}
          >
            {saving ? <span className="spinner spinner-sm" aria-hidden="true" /> : <span aria-hidden="true">✕</span>}
            I&apos;m not attending
          </button>
        </div>

        {editing && (
          <div className="change-row">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setEditing(false)}
              disabled={saving}
            >
              Keep my current response
            </button>
          </div>
        )}
      </div>
    );
  }

  const attending = studentIntent === 'attending';

  return (
    <div>
      <div className={`intent-confirmed ${attending ? 'is-attending' : 'is-skipping'}`}>
        <span className="confirm-icon" aria-hidden="true">✓</span>
        <div>
          <p className="confirm-title">
            {attending
              ? `You're marked for ${mealName.toLowerCase()}`
              : `${mealName} marked as not attending`}
          </p>
          <p className="confirm-text">
            {attending
              ? 'Your response helps the mess prepare the right amount of food.'
              : 'Thanks for updating your meal preference.'}
          </p>
        </div>
      </div>

      <div className="change-row">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => setEditing(true)}
          disabled={saving}
        >
          Change response
        </button>
        {cutoffLabel && (
          <span className="cutoff-note">
            <span aria-hidden="true">🕒</span>
            You can change this until {cutoffLabel}
          </span>
        )}
      </div>
    </div>
  );
}
