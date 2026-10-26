/** Compact metric tile used on the student dashboard, history and profile. */

export default function StatCard({ label, value, hint, icon, accent, meter }) {
  const numericMeter = typeof meter === 'number' ? meter : (meter !== null && meter !== undefined && meter !== '' ? Number(meter) : null);
  const hasValidMeter = numericMeter !== null && !isNaN(numericMeter);

  return (
    <div className={`stat-card${accent ? ` stat-accent-${accent}` : ''}`}>
      <p className="stat-label">
        {icon && <span aria-hidden="true">{icon}</span>}
        {label}
      </p>
      <p className="stat-value">{value ?? '—'}</p>
      {hint && <p className="stat-hint">{hint}</p>}
      {hasValidMeter && (
        <div className="meter" role="presentation">
          <div className="meter-fill" style={{ width: `${Math.min(Math.max(numericMeter, 0), 100)}%` }} />
        </div>
      )}
    </div>
  );
}
