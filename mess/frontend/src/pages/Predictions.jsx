import { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { API_BASE_URL } from '../config/api';

export default function Predictions() {
  const [history, setHistory] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mealFilter, setMealFilter] = useState('Dinner'); // default

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/predictions`).then(res => res.json()),
      fetch(`${API_BASE_URL}/api/analytics`).then(res => res.json())
    ]).then(([historyData, analyticsData]) => {
      setHistory(historyData);
      setAnalytics(analyticsData);
      setLoading(false);
    }).catch(err => {
      console.error('Error fetching prediction data:', err);
      setLoading(false);
    });
  }, []);

  if (loading) return <div>Loading...</div>;

  const chartData = (mealFilter === 'All Meals'
    ? history
    : history.filter(item => (item.meal || '').toLowerCase() === mealFilter.toLowerCase())
  ).slice(0, 14).reverse();

  return (
    <div>
      <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '1.5rem' }}>Predictions vs Actual</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {['Breakfast', 'Lunch', 'Dinner', 'All Meals'].map(meal => (
            <button 
              key={meal}
              className={`btn ${mealFilter === meal ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setMealFilter(meal)}
            >
              {meal}
            </button>
          ))}
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem', height: '400px' }}>
        <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Historical Trend ({mealFilter})</h3>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border-color)' }} />
            <YAxis tick={{ fill: 'var(--text-muted)' }} axisLine={{ stroke: 'var(--border-color)' }} />
            <Tooltip 
              contentStyle={{ borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}
            />
            <Legend wrapperStyle={{ paddingTop: '1rem' }} />
            <Line type="monotone" dataKey="predicted" name="Predicted Attendance" stroke="var(--primary-color)" strokeWidth={3} activeDot={{ r: 8 }} />
            <Line type="monotone" dataKey="actual" name="Actual Attendance" stroke="var(--success-color)" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {analytics && (
        <div className="grid grid-cols-4 gap-4">
          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Average Accuracy</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{analytics.averageAccuracy}%</div>
          </div>
          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Average Error</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>±{analytics.averageError} students</div>
          </div>
          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Highest Accuracy</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-color)' }}>{analytics.highestAccuracy}%</div>
          </div>
          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Lowest Accuracy</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--warning-color)' }}>{analytics.lowestAccuracy}%</div>
          </div>
        </div>
      )}
    </div>
  );
}
