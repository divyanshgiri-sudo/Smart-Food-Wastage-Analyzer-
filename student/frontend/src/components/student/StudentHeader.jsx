/** Sticky page header: current page title, notification bell, account chip. */

import { Link } from 'react-router-dom';
import { initials } from '../../utils/format';

export default function StudentHeader({ title = 'Dashboard', subtitle = '', user, unreadCount = 0 }) {
  const numericUnread = Number(unreadCount) || 0;
  const userName = user?.name || 'Student';
  const userIdentifier = user?.studentId || user?.regNo || 'Student';

  return (
    <header className="student-header">
      <div className="header-titles">
        <h1 className="header-title">{title}</h1>
        {subtitle && <p className="header-sub">{subtitle}</p>}
      </div>

      <div className="header-actions">
        <Link
          to="/student/notifications"
          className="bell"
          aria-label={
            numericUnread > 0
              ? `Notifications, ${numericUnread} unread`
              : 'Notifications, none unread'
          }
        >
          <span aria-hidden="true">🔔</span>
          {numericUnread > 0 && <span className="bell-dot" aria-hidden="true">{numericUnread}</span>}
        </Link>

        <div className="header-chip">
          <span className="avatar" aria-hidden="true">{initials(user?.name || '')}</span>
          <span>
            <span className="header-chip-name" style={{ display: 'block' }}>{userName}</span>
            <span className="header-chip-role" style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {userIdentifier}
            </span>
          </span>
        </div>
      </div>
    </header>
  );
}
