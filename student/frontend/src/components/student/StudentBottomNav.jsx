/** Mobile navigation. Replaces the sidebar below 860px with touch-sized targets. */

import { NavLink } from 'react-router-dom';
import { STUDENT_NAV } from './navItems';

export default function StudentBottomNav({ unreadCount = 0 }) {
  const navItems = Array.isArray(STUDENT_NAV) ? STUDENT_NAV : [];
  const numericUnread = Number(unreadCount) || 0;

  return (
    <nav className="bottom-nav" aria-label="Student portal">
      <div className="bottom-nav-inner">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `bottom-link${isActive ? ' active' : ''}`}
          >
            <span className="nav-icon" aria-hidden="true">{item.icon}</span>
            {item.short}
            {item.to === '/student/notifications' && numericUnread > 0 && (
              <span className="bottom-badge" aria-hidden="true">{numericUnread}</span>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
