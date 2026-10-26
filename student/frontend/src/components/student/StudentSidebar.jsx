/** Desktop navigation rail for the student portal. */

import { NavLink } from 'react-router-dom';
import { STUDENT_NAV } from './navItems';
import { initials } from '../../utils/format';

export default function StudentSidebar({ user, unreadCount = 0, onLogout }) {
  const numericUnread = Number(unreadCount) || 0;
  const userName = user?.name || 'Student';
  const userIdentifier = user?.studentId || user?.regNo || 'Student';
  const navItems = Array.isArray(STUDENT_NAV) ? STUDENT_NAV : [];

  return (
    <nav className="student-sidebar" aria-label="Student portal">
      <div className="student-brand">
        <span className="brand-mark" aria-hidden="true">🍃</span>
        <span className="brand-text">
          <span className="brand-name">Smart Mess</span>
          <span className="brand-sub">Student portal</span>
        </span>
      </div>

      <ul className="student-nav">
        {navItems.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            >
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
              {item.to === '/student/notifications' && numericUnread > 0 && (
                <span className="nav-count">
                  {numericUnread}
                  <span className="sr-only"> unread notifications</span>
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-foot">
        <div className="sidebar-user">
          <span className="avatar" aria-hidden="true">{initials(user?.name || '')}</span>
          <span className="sidebar-user-text">
            <span className="sidebar-user-name">{userName}</span>
            <span className="sidebar-user-role">{userIdentifier}</span>
          </span>
        </div>
        <button type="button" className="logout-btn" onClick={onLogout}>
          <span className="nav-icon" aria-hidden="true">⏻</span>
          Log out
        </button>
      </div>
    </nav>
  );
}
