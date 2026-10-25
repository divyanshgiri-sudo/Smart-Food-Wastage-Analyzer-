/**
 * Smart Food Wastage Analyser — Student application routes.
 *
 *   /login          student sign-in
 *   /signup         student registration
 *   /student/*      student portal (guarded, role: student)
 */

import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';

import Login from './pages/Login';
import Signup from './pages/Signup';
import NotFound from './pages/NotFound';

import StudentLayout from './components/student/StudentLayout';
import StudentDashboard from './pages/student/StudentDashboard';
import StudentMeals from './pages/student/StudentMeals';
import StudentHistory from './pages/student/StudentHistory';
import StudentNotifications from './pages/student/StudentNotifications';
import StudentProfile from './pages/student/StudentProfile';

import './styles/student.css';

/** Sends visitors at "/" to the student portal. */
function RootRedirect() {
  return <Navigate to="/student/dashboard" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<RootRedirect />} />

          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* ---------------- Student portal ---------------- */}
          <Route element={<ProtectedRoute role="student" loginPath="/login" />}>
            <Route path="/student" element={<StudentLayout />}>
              <Route index element={<Navigate to="/student/dashboard" replace />} />
              <Route path="dashboard" element={<StudentDashboard />} />
              <Route path="meals" element={<StudentMeals />} />
              <Route path="history" element={<StudentHistory />} />
              <Route path="notifications" element={<StudentNotifications />} />
              <Route path="profile" element={<StudentProfile />} />
            </Route>
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
