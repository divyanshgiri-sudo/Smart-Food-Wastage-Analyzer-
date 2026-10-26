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
  const { isAuthenticated, role: userRole, bootstrapping } = useAuth();
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
    return <Navigate to={loginPath} replace />;
  }

  return <Outlet />;
}
