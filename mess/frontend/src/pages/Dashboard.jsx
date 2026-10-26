import { useState, useEffect, useCallback } from 'react';
import { Users, CheckCircle, Clock } from 'lucide-react';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL, HARDWARE_API_URL } from '../config/api';

export default function Dashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  // Hardware Mode & Enrollment states
  const [hardwareMode, setHardwareMode] = useState('verify');
  const [capturedFpId, setCapturedFpId] = useState(null);
  const [enrollStudentId, setEnrollStudentId] = useState('');
  const [enrollName, setEnrollName] = useState('');
  const [enrollMessage, setEnrollMessage] = useState(null);
  const [enrolling, setEnrolling] = useState(false);

  // Timer to dynamically update the active meal based on local system clock
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 5000); // Check every 5 seconds for immediate boundary rollover
    return () => clearInterval(timer);
  }, []);

  const fetchSummary = useCallback(() => {
    const now = new Date();
    const localMinutes = now.getHours() * 60 + now.getMinutes();
    const localDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    fetch(`${API_BASE_URL}/api/dashboard/summary?localMinutes=${localMinutes}&date=${localDateStr}`)
      .then(res => res.json())
      .then(json => {
        setDashboardData(json);
        setRecentActivity(prev => (prev.length === 0 && json.recentActivity ? json.recentActivity : prev));
        if (json.notifications && json.notifications.length > 0) {
          setNotifications(prev => (prev.length === 0 ? json.notifications : prev));
        }
        setLoading(false);
      })
      .catch(err => {
        console.error('Error fetching dashboard data:', err);
        setLoading(false);
      });
  }, []);

  const fetchHardwareStatus = useCallback(() => {
    fetch(`${HARDWARE_API_URL}/api/hardware/status`)
      .then(res => res.json())
      .then(data => {
        if (data.mode) setHardwareMode(data.mode);
        if (data.lastCapturedId) setCapturedFpId(data.lastCapturedId);
      })
      .catch(err => console.error('Error fetching hardware status from port 5002:', err));
  }, []);

  useEffect(() => {
    fetchSummary();
    fetchHardwareStatus();

    // Socket.io real-time connection to Mess backend
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      console.log('[mess dashboard] Connected to real-time socket server');
    });

    // Optional direct socket connection to student backend (port 5000 in dev) for multi-port environments
    const studentSocketUrl = (import.meta.env.VITE_STUDENT_SOCKET_URL || 'http://localhost:5000').replace(/\/+$/, '');
    let studentSocket = null;
    if (studentSocketUrl && studentSocketUrl !== SOCKET_URL) {
      try {
        studentSocket = io(studentSocketUrl, { transports: ['websocket', 'polling'] });
        studentSocket.on('connect', () => {
          console.log('[mess dashboard] Connected to student real-time socket server:', studentSocketUrl);
        });
      } catch (err) {
        console.warn('[mess dashboard] Could not connect to student socket:', err);
      }
    }

    const handleAttendanceUpdate = (scanResult) => {
      console.log('[Dashboard Socket] attendance:update received:', scanResult);
      if (!scanResult) return;
      const mealName = scanResult.mealName || (scanResult.meal ? scanResult.meal.charAt(0).toUpperCase() + scanResult.meal.slice(1) : 'Meal');
      const studentId = scanResult.studentId || scanResult.name || 'Student';

      let newActivity = null;
      let newNotification = null;

      if (scanResult.status === 'already_marked') {
        newNotification = {
          id: 'notif-' + Date.now(),
          type: 'warning',
          message: `⚠️ Duplicate scan attempt by student [${studentId}] for ${mealName}`,
        };
        newActivity = {
          id: 'act-dup-' + Date.now(),
          title: `Duplicate scan attempt: ${studentId} (${mealName})`,
          description: `Duplicate scan attempt: ${studentId} (${mealName})`,
          timestamp: 'Just now',
          time: 'Just now',
          variant: 'duplicate',
          dotColor: '#ef4444',
        };
      } else if (scanResult.status === 'success') {
        const isWalkIn = scanResult.isWalkIn;
        newActivity = {
          id: 'act-scan-' + Date.now(),
          title: `Student ${studentId} verified for ${mealName} (${isWalkIn ? 'Walk-in' : 'Booked'})`,
          description: `Student ${studentId} verified for ${mealName} (${isWalkIn ? 'Walk-in' : 'Booked'})`,
          timestamp: 'Just now',
          time: 'Just now',
          variant: isWalkIn ? 'walkin' : 'booked',
          dotColor: isWalkIn ? '#3b82f6' : 'var(--success-color)',
        };
      }

      if (newActivity) {
        setRecentActivity(prev => [newActivity, ...prev].slice(0, 6));
      }
      if (newNotification) {
        setNotifications(prev => [newNotification, ...prev].slice(0, 5));
      }
      fetchSummary();
    };

    const handleIntentUpdate = (intentData) => {
      console.log('[Dashboard Socket] intent:update received:', intentData);
      if (!intentData) return;
      const mealLabel = intentData.mealId ? intentData.mealId.charAt(0).toUpperCase() + intentData.mealId.slice(1) : 'Meal';
      const studentId = intentData.studentId || 'Student';

      const newActivity = {
        id: 'act-intent-' + Date.now(),
        title: `Student ${studentId} updated ${mealLabel} response to: ${intentData.intent}`,
        description: `Student ${studentId} updated ${mealLabel} response to: ${intentData.intent}`,
        timestamp: 'Just now',
        time: 'Just now',
        variant: 'intent',
        dotColor: '#f59e0b',
      };

      setRecentActivity(prev => [newActivity, ...prev].slice(0, 6));

      // Dynamically re-render Confirmed Intentions metric without manual page refresh
      setDashboardData(prev => {
        if (!prev) return prev;
        const targetMealId = intentData.mealId;
        const isAttending = intentData.intent === 'attending';

        const updatedMeals = (prev.meals || []).map(m => {
          if (m.id === targetMealId) {
            const currentConfirmed = m.confirmed || 0;
            const newConfirmed = isAttending ? currentConfirmed + 1 : Math.max(0, currentConfirmed - 1);
            return {
              ...m,
              confirmed: newConfirmed,
              attending: newConfirmed,
            };
          }
          return m;
        });

        let updatedCurrent = prev.currentMeal;
        if (updatedCurrent && updatedCurrent.id === targetMealId) {
          const currentConfirmed = updatedCurrent.confirmed || 0;
          const newConfirmed = isAttending ? currentConfirmed + 1 : Math.max(0, currentConfirmed - 1);
          updatedCurrent = {
            ...updatedCurrent,
            confirmed: newConfirmed,
          };
        }

        let updatedSummary = prev.summary;
        if (updatedSummary && updatedCurrent && updatedCurrent.id === targetMealId) {
          updatedSummary = {
            ...updatedSummary,
            confirmed: updatedCurrent.confirmed,
          };
        }

        return {
          ...prev,
          meals: updatedMeals,
          currentMeal: updatedCurrent,
          summary: updatedSummary,
        };
      });

      // Synchronize with database truth
      fetchSummary();
    };

    const handleHardwareModeChange = (data) => {
      console.log('[Dashboard Socket] hardware:mode_changed received:', data);
      if (data && data.mode) {
        setHardwareMode(data.mode);
        if (data.mode === 'enroll') setCapturedFpId(data.lastCapturedId || null);
      }
    };

    const handleFingerprintCaptured = (data) => {
      console.log('[Dashboard Socket] hardware:fingerprint_captured received:', data);
      if (data && data.fingerprintId) {
        setCapturedFpId(data.fingerprintId);
        setNotifications(prev => [
          {
            id: 'notif-cap-' + Date.now(),
            type: 'info',
            message: `⚡ New Fingerprint Template Captured: Slot #${data.fingerprintId}`,
          },
          ...prev,
        ].slice(0, 5));
      }
    };

    socket.on('attendance:update', handleAttendanceUpdate);
    socket.on('intent:update', handleIntentUpdate);
    socket.on('dashboard:stats_changed', () => fetchSummary());
    socket.on('meal:concluded', () => fetchSummary());
    socket.on('hardware:mode_changed', handleHardwareModeChange);
    socket.on('hardware:fingerprint_captured', handleFingerprintCaptured);

    if (studentSocket) {
      studentSocket.on('intent:update', handleIntentUpdate);
      studentSocket.on('dashboard:stats_changed', () => fetchSummary());
      studentSocket.on('attendance:update', handleAttendanceUpdate);
    }

    return () => {
      socket.disconnect();
      if (studentSocket) studentSocket.disconnect();
    };
  }, [fetchSummary, fetchHardwareStatus]);

  const toggleHardwareMode = (newMode) => {
    fetch(`${HARDWARE_API_URL}/api/hardware/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: newMode }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.mode) {
          setHardwareMode(data.mode);
          setEnrollMessage(null);
        }
      })
      .catch(err => console.error('Error toggling hardware mode on port 5002:', err));
  };

  const handleEnrollSubmit = (e) => {
    e.preventDefault();
    if (!enrollStudentId || !enrollName || !capturedFpId) return;

    const trimmedName = enrollName.trim();
    const trimmedStudentId = enrollStudentId.trim();

    const nameRegex = /^[A-Za-z\s]+$/;
    const studentIdRegex = /^\d{2}[A-Za-z]{3}\d{4,5}$/;

    if (!nameRegex.test(trimmedName)) {
      setEnrollMessage({
        type: 'error',
        text: 'Student name must only contain letters and spaces (no numbers or special characters).',
      });
      return;
    }

    if (!studentIdRegex.test(trimmedStudentId)) {
      setEnrollMessage({
        type: 'error',
        text: 'Registration number must be 2 numbers, 3 alphabets, followed by 4-5 numbers (e.g., 24BCA7612).',
      });
      return;
    }

    setEnrolling(true);
    setEnrollMessage(null);

    fetch(`${HARDWARE_API_URL}/api/hardware/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: trimmedStudentId,
        name: trimmedName,
        fingerprintId: capturedFpId,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || data.message || 'Failed to enroll student.');
        }
        return data;
      })
      .then(data => {
        setEnrolling(false);
        if (data.status === 'success' || data.user) {
          setEnrollMessage({ type: 'success', text: data.message || 'Fingerprint linked successfully!' });
          setCapturedFpId(null);
          setEnrollStudentId('');
          setEnrollName('');
          fetchSummary();
        } else {
          setEnrollMessage({ type: 'error', text: data.error || data.message || 'Failed to link fingerprint.' });
        }
      })
      .catch(err => {
        setEnrolling(false);
        setEnrollMessage({ type: 'error', text: err.message || 'Error connecting to port 5002.' });
      });
  };

  if (loading) return <div>Loading...</div>;
  if (!dashboardData) return <div>Error loading data.</div>;

  const formattedCurrentDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const localMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();

  // Dynamic active meal resolution based on local system clock
  const defaultMealWindows = [
    { id: 'breakfast', name: 'Breakfast', label: 'Breakfast (07:00 - 09:00)', time: '07:00 - 09:00', startMin: 420, endMin: 540, predicted: 0, confirmed: 0, actual: 0 },
    { id: 'lunch', name: 'Lunch', label: 'Lunch (12:30 - 14:15)', time: '12:30 - 14:15', startMin: 750, endMin: 855, predicted: 0, confirmed: 0, actual: 0 },
    { id: 'dinner', name: 'Dinner', label: 'Dinner (19:15 - 21:00)', time: '19:15 - 21:00', startMin: 1155, endMin: 1260, predicted: 0, confirmed: 0, actual: 0 },
  ];

  const availableMeals = (dashboardData?.meals && dashboardData.meals.length > 0)
    ? dashboardData.meals
    : defaultMealWindows;

  const sortedMeals = [...availableMeals].sort((a, b) => a.startMin - b.startMin);

  let activeMeal = null;
  let activeStatus = 'Serving';
  let isTomorrow = false;

  // Exact immediate meal rollover logic:
  // The exact moment a meal's end time passes, the "Active Meal" instantly rolls over
  // to the next upcoming meal (e.g., right after Lunch ends, immediately display Dinner;
  // after Dinner ends, display tomorrow's Breakfast).
  const activeCandidate = sortedMeals.find(m => localMinutes <= m.endMin);

  if (activeCandidate) {
    activeMeal = activeCandidate;
    activeStatus = localMinutes >= activeCandidate.startMin ? 'Serving' : 'Upcoming';
    isTomorrow = false;
  } else {
    // All meals today have concluded. Rollover immediately to tomorrow's Breakfast!
    activeMeal = sortedMeals[0];
    activeStatus = 'Upcoming';
    isTomorrow = true;
  }

  // Next meal candidate
  const activeIndex = sortedMeals.findIndex(m => m.id === activeMeal.id);
  const nextMealCandidate = sortedMeals[(activeIndex + 1) % sortedMeals.length] || sortedMeals[0];

  const currentMeal = {
    ...activeMeal,
    status: activeStatus,
    isTomorrow: isTomorrow || Boolean(dashboardData?.isTomorrow) || Boolean(dashboardData?.currentMeal?.isTomorrow),
    label: (activeMeal.label || `${activeMeal.name} (${activeMeal.time})`) + (isTomorrow ? ' (Tomorrow)' : ''),
    predicted: (isTomorrow && dashboardData?.currentMeal?.isTomorrow)
      ? (dashboardData.currentMeal.predicted ?? activeMeal.predicted ?? 0)
      : (dashboardData?.currentMeal?.predicted ?? activeMeal.predicted ?? (dashboardData?.summary?.predicted ?? 0)),
    confirmed: (isTomorrow && dashboardData?.currentMeal?.isTomorrow)
      ? (dashboardData.currentMeal.confirmed ?? 0)
      : (dashboardData?.currentMeal?.id === activeMeal.id && dashboardData?.currentMeal?.confirmed !== undefined
          ? dashboardData.currentMeal.confirmed
          : (activeMeal.confirmed ?? (dashboardData?.summary?.confirmed ?? 0))),
    actual: isTomorrow ? 0 : (activeMeal.actual ?? (dashboardData?.summary?.actualSoFar ?? 0)),
  };

  const nextMeal = {
    ...nextMealCandidate,
    label: nextMealCandidate.label || `${nextMealCandidate.name} (${nextMealCandidate.time})`,
    predicted: nextMealCandidate.predicted ?? 0,
    confirmed: nextMealCandidate.confirmed ?? 0,
    recommended: nextMealCandidate.recommended ?? Math.round((nextMealCandidate.confirmed || nextMealCandidate.predicted || 0) * 0.98),
  };

  const fullDayPredicted = sortedMeals.reduce((sum, m) => sum + (m.predicted ?? 0), 0);
  const fullDayConfirmed = sortedMeals.reduce((sum, m) => sum + (m.confirmed ?? 0), 0);
  const fullDayActual = sortedMeals.reduce((sum, m) => sum + (m.actual ?? 0), 0);

  const fullDay = {
    predicted: fullDayPredicted,
    confirmed: fullDayConfirmed,
    actual: fullDayActual,
  };

  const currentAccuracy = (currentMeal.confirmed > 0 && currentMeal.actual > 0)
    ? Math.min(100, (currentMeal.actual / currentMeal.confirmed) * 100)
    : 0;

  const overallAccuracy = (fullDay.confirmed > 0 && fullDay.actual > 0)
    ? Math.min(100, (fullDay.actual / fullDay.confirmed) * 100)
    : 0;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.5rem' }}>Dashboard Overview</h2>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
            Real-time biometric entrance sync & meal intent analyzer
          </p>
        </div>
        <span className="badge badge-success">
          Active Meal: {currentMeal.name}
        </span>
      </div>

      {/* ESP32 Hardware Mode Control Panel */}
      <div className="card" style={{ marginBottom: '1.5rem', borderLeft: hardwareMode === 'enroll' ? '4px solid #8b5cf6' : '4px solid #10b981' }}>
        <div className="flex justify-between items-center" style={{ flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', margin: 0 }}>ESP32 Scanner Mode</h3>
              <span className={`badge ${hardwareMode === 'enroll' ? 'badge-warning' : 'badge-success'}`} style={{ backgroundColor: hardwareMode === 'enroll' ? '#8b5cf6' : undefined, color: '#fff' }}>
                {hardwareMode === 'enroll' ? 'ENROLLMENT MODE' : 'VERIFICATION MODE (LIVE)'}
              </span>
            </div>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginBottom: 0 }}>
              {hardwareMode === 'enroll'
                ? 'Scanner saves new fingerprint templates to memory and reports captured Slot IDs.'
                : 'Scanner verifies incoming student fingerprints against SQLite attendance database.'}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => toggleHardwareMode('verify')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md, 6px)',
                cursor: 'pointer',
                backgroundColor: hardwareMode === 'verify' ? '#10b981' : 'transparent',
                color: hardwareMode === 'verify' ? '#fff' : 'inherit',
                border: '1px solid #10b981',
                fontWeight: 600,
              }}
            >
              Verification Mode
            </button>
            <button
              onClick={() => toggleHardwareMode('enroll')}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md, 6px)',
                cursor: 'pointer',
                backgroundColor: hardwareMode === 'enroll' ? '#8b5cf6' : 'transparent',
                color: hardwareMode === 'enroll' ? '#fff' : 'inherit',
                border: '1px solid #8b5cf6',
                fontWeight: 600,
              }}
            >
              Enrollment Mode
            </button>
          </div>
        </div>

        {/* Enrollment Capture & Mapping Form */}
        {hardwareMode === 'enroll' && (
          <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-color, #e5e7eb)' }}>
            {capturedFpId ? (
              <form onSubmit={handleEnrollSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ padding: '0.75rem 1rem', backgroundColor: 'rgba(139, 92, 246, 0.1)', borderRadius: 'var(--radius-md, 6px)', border: '1px solid #8b5cf6', color: '#6d28d9', fontSize: '0.875rem', fontWeight: 600 }}>
                  ⚡ New Fingerprint Template Captured: Slot #{capturedFpId}
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="Enter Student Name"
                    value={enrollName}
                    onChange={(e) => setEnrollName(e.target.value)}
                    style={{ flex: 1, minWidth: '180px', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md, 6px)', border: '1px solid #ccc', fontSize: '0.875rem' }}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Enter Student Reg No (e.g. 24BCA7612)"
                    value={enrollStudentId}
                    onChange={(e) => setEnrollStudentId(e.target.value)}
                    style={{ flex: 1, minWidth: '180px', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md, 6px)', border: '1px solid #ccc', fontSize: '0.875rem' }}
                    required
                  />
                  <button
                    type="submit"
                    disabled={enrolling}
                    style={{ padding: '0.5rem 1.25rem', backgroundColor: '#8b5cf6', color: '#fff', borderRadius: 'var(--radius-md, 6px)', border: 'none', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {enrolling ? 'Enrolling...' : `Link Slot #${capturedFpId}`}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Ready to enroll: Instruct student to place finger on the ESP32 scanner twice. The captured Slot ID will appear here automatically.
              </div>
            )}

            {enrollMessage && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: enrollMessage.type === 'success' ? '#10b981' : '#ef4444', fontWeight: 500 }}>
                {enrollMessage.text}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Notifications */}
      {notifications && notifications.length > 0 && (
        <div style={{ marginBottom: '1.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {notifications.map(note => (
            <div key={note.id} className={`badge badge-${note.type}`} style={{ padding: '0.75rem 1rem', borderRadius: 'var(--radius-md)', display: 'block', fontSize: '0.875rem' }}>
              {note.message}
            </div>
          ))}
        </div>
      )}

      {/* Tier 1: Current Active Meal Cards */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.35rem' }}>
          {formattedCurrentDate}
        </div>
        <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>
            Current Active Meal ({currentMeal.label || currentMeal.name})
          </h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            Status: {currentMeal.status}
          </span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Meal Predicted</h3>
              <Users size={18} color="var(--primary-color)" />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{currentMeal.predicted}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Prepared for this meal</div>
          </div>
          
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Confirmed Intentions</h3>
              <CheckCircle size={18} color="var(--success-color)" />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--success-color)' }}>{currentMeal.confirmed}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Students opting in</div>
          </div>
          
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Actual Served</h3>
              <Users size={18} color="var(--warning-color)" />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary-color)' }}>{currentMeal.actual}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>Recorded attendance</div>
          </div>
          
          <div className="card">
            <div className="flex items-center justify-between" style={{ marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500 }}>Current Accuracy</h3>
              <Clock size={18} color="var(--primary-color)" />
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 700 }}>{currentAccuracy > 0 ? `${currentAccuracy.toFixed(1)}%` : '0%'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--success-color)', marginTop: '0.5rem' }}>Active meal ratio</div>
          </div>
        </div>
      </div>

      {/* Tier 2: Next Meal Prediction & Recent Activity */}
      <div className="grid grid-cols-3 gap-6" style={{ marginBottom: '2rem' }}>
        {/* Next Meal Prediction Card */}
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="flex justify-between items-center" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Next Meal Prediction</h3>
          </div>
          
          <div className="flex justify-between items-center" style={{ padding: '1.5rem', backgroundColor: 'var(--bg-color)', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.5rem' }}>Upcoming Meal</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{nextMeal.label || 'Dinner (19:15 - 21:00)'}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.5rem' }}>Expected Attendance</div>
              <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--primary-color)' }}>{nextMeal.predicted}</div>
              {nextMeal.lowerBound && nextMeal.upperBound && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  90% Interval: [{nextMeal.lowerBound} – {nextMeal.upperBound}]
                </div>
              )}
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Confirmed Intentions</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>{nextMeal.confirmed}</div>
            </div>
            <div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Recommended Preparation</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 600 }}>~{nextMeal.recommended || nextMeal.confirmed} meals</div>
            </div>
          </div>
          
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1.5rem', fontStyle: 'italic' }}>
            *Prediction is based on historical attendance trends and active meal confirmations.
          </div>
        </div>

        {/* Recent Activity */}
        <div className="card">
          <h3 style={{ fontSize: '1.125rem', marginBottom: '1.5rem' }}>Recent Activity</h3>
          <div className="flex flex-col gap-4">
            {recentActivity && recentActivity.map(activity => (
              <div key={activity.id} className="flex gap-3 items-start">
                <div style={{ marginTop: '0.35rem' }}>
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: activity.dotColor || (activity.variant === 'duplicate' ? '#ef4444' : activity.variant === 'walkin' ? '#3b82f6' : 'var(--success-color)')
                  }}></div>
                </div>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    {activity.title || activity.description}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {activity.timestamp || activity.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tier 3: Full Day Overview Cards */}
      <div style={{ marginTop: '1rem' }}>
        <div className="flex justify-between items-center" style={{ marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Full Day Overview (Daily Cumulative)</h3>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Breakfast + Lunch + Dinner Aggregate</span>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.5rem' }}>Full Day Predicted</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{fullDay.predicted}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Total planned for today</div>
          </div>

          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.5rem' }}>Full Day Confirmed</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--success-color)' }}>{fullDay.confirmed}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Cumulative student opt-ins</div>
          </div>

          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.5rem' }}>Full Day Actual Served</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--primary-color)' }}>{fullDay.actual}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>Total recorded entrances</div>
          </div>

          <div className="card">
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', fontWeight: 500, marginBottom: '0.5rem' }}>Overall Daily Accuracy</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{overallAccuracy > 0 ? `${overallAccuracy.toFixed(1)}%` : '0%'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--success-color)', marginTop: '0.25rem' }}>Attendance vs Opt-ins</div>
          </div>
        </div>
      </div>
    </div>
  );
}

