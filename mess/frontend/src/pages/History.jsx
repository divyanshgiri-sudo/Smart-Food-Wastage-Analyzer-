import { useState, useEffect } from 'react';
import { API_BASE_URL } from '../config/api';

export default function History() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/predictions`)
      .then(res => res.json())
      .then(data => {
        setHistory(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching history:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Historical Records</h2>

      <div className="card">
        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
          This table contains the raw historical records of predictions and actual turnouts used by the ML model.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Meal</th>
                <th>Predicted</th>
                <th>Actual</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record, index) => {
                const hasActual = record.actual !== null && record.actual !== undefined;
                return (
                  <tr key={index}>
                    <td style={{ fontWeight: 500 }}>{record.date}</td>
                    <td>{record.meal}</td>
                    <td>{record.predicted ?? '-'}</td>
                    <td style={{ fontWeight: 600, color: hasActual ? 'var(--primary-color)' : 'inherit' }}>
                      {hasActual ? record.actual : '-'}
                    </td>
                    <td>
                      <span className={`badge ${hasActual ? 'badge-success' : 'badge-neutral'}`}>
                        {hasActual ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
