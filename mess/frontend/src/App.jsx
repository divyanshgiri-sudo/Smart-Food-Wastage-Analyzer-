import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Signup from './pages/Signup';
import DashboardLayout from './components/Layout/DashboardLayout';
import Dashboard from './pages/Dashboard';
import TodaysMeals from './pages/TodaysMeals';
import Predictions from './pages/Predictions';
import Attendance from './pages/Attendance';
import History from './pages/History';
import Profile from './pages/Profile';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, token, loading } = useAuth();
  if (loading) {
    return <div style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>Checking session...</div>;
  }
  const storedToken = token || localStorage.getItem('token');
  if (!storedToken || !user) return <Navigate to="/login" replace />;
  return children;
};

function RootRedirect() {
  return <Navigate to="/dashboard" replace />;
}

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        
        {/* Protected Dashboard Routes */}
        <Route element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          {/* <Route path="/todays-meals" element={<TodaysMeals />} /> */}
          <Route path="/todays-meals" element={<Navigate to="/dashboard" replace />} />
          <Route path="/predictions" element={<Predictions />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/history" element={<History />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
