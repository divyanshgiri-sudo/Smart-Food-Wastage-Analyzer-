/**
 * Route guard for the student portal.
 *
 * Anonymous visitors are sent to the sign-in page and, once they have
 * signed in, forwarded to the page they originally asked for.
 */

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LoadingState } from './common/StateBlocks';

export default function ProtectedRoute({ role, loginPath = '/login' }) {
  const { isAuthenticated, role: userRole, bootstrapping, logout } = useAuth();
  const location = useLocation();

  // Waiting on the stored-token check; redirecting now would log the user out
  // on every page refresh.
  if (bootstrapping) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center' }}>
        <LoadingState message="Checking your session…" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  }

  const roleMatches = !role || (userRole && String(userRole).trim().toLowerCase() === String(role).trim().toLowerCase());
  if (!roleMatches) {
    return (
      <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24, background: '#f8fafc' }}>
        <div className="card" style={{ maxWidth: 440, width: '100%', padding: '2rem', textAlign: 'center', background: '#fff', borderRadius: 16, border: '1px solid #e2e7f0', boxShadow: '0 20px 60px -12px rgba(0,0,0,0.12)' }}>
          <span style={{ fontSize: 40, display: 'block', marginBottom: 16 }} aria-hidden="true">🚫</span>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>
            Unauthorized Role - Please Sign Out
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem', marginBottom: 20 }}>
            Your account ({userRole || 'No role'}) is not authorized to access this portal. Please sign out to continue.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              await logout();
              window.location.href = loginPath;
            }}
            style={{
              padding: '10px 24px',
              background: '#0f1d33',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <Outlet />;
}
