/**
 * Meal-related notifications: cutoff reminders, saved responses, recorded
 * attendance and menu changes. Read state lives on the server so the unread
 * badge in the navigation stays correct across pages.
 */

import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import NotificationCard from '../../components/student/NotificationCard';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/StateBlocks';
import { useApi } from '../../hooks/useApi';
import { studentApi } from '../../services/api';
import { useToast } from '../../context/ToastContext';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'cutoff', label: 'Cutoffs' },
  { key: 'menu', label: 'Menu updates' },
];

export default function StudentNotifications() {
  const { data, loading, error, reload, setData } = useApi(() => studentApi.notifications(), []);
  const outlet = useOutletContext() || {};
  const setUnreadCount = typeof outlet.setUnreadCount === 'function' ? outlet.setUnreadCount : () => {};
  const { notify } = useToast();
  const [filter, setFilter] = useState('all');
  const [busy, setBusy] = useState(false);

  const notifications = Array.isArray(data?.notifications) ? data.notifications : [];
  const unreadCount = Number(data?.unreadCount) || 0;

  const visible = notifications.filter((n) => {
    if (!n) return false;
    if (filter === 'all') return true;
    if (filter === 'unread') return !n.read;
    return n.type === filter;
  });

  async function markRead(id, read) {
    setBusy(true);
    try {
      const response = await studentApi.markNotification(id, read);
      setData(response);
      if (response && response.unreadCount !== undefined) {
        setUnreadCount(Number(response.unreadCount) || 0);
      }
    } catch (err) {
      notify({ variant: 'error', title: 'Could not update that notification', text: err?.message || 'Error updating notification' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="history-toolbar">
        <div className="notif-filters" role="group" aria-label="Filter notifications">
          {(FILTERS || []).map((option) => (
            <button
              key={option.key}
              type="button"
              className="filter-chip"
              aria-pressed={filter === option.key}
              onClick={() => setFilter(option.key)}
            >
              {option.label}
              {option.key === 'unread' && unreadCount > 0 && ` (${unreadCount})`}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => markRead('all', true)}
          disabled={busy || unreadCount === 0}
        >
          Mark all as read
        </button>
      </div>

      {loading && (
        <div className="card">
          <LoadingState message="Loading your notifications…" />
        </div>
      )}

      {!loading && error && (
        <div className="card">
          <ErrorState
            title="Unable to load notifications"
            message={error?.message || 'Could not load notifications.'}
            onRetry={reload}
          />
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <div className="card">
          <EmptyState
            icon="🔔"
            title={filter === 'all' ? 'No notifications yet' : 'Nothing matches this filter'}
            message={
              filter === 'all'
                ? 'Cutoff reminders, saved responses and menu updates will appear here.'
                : 'Try a different filter to see your other notifications.'
            }
            action={
              filter !== 'all' ? (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setFilter('all')}>
                  Show all notifications
                </button>
              ) : null
            }
          />
        </div>
      )}

      {!loading && !error && visible.length > 0 && (
        <div className="notif-list">
          {visible.map((notification) => (
            <NotificationCard
              key={notification.id || Math.random()}
              notification={notification}
              onMarkRead={markRead}
            />
          ))}
        </div>
      )}

      <p className="demo-note" style={{ marginTop: 20 }}>
        <span aria-hidden="true">ℹ️</span>
        <span>
          <strong>Prototype build.</strong> Notifications are demo messages, though whether you
          have read them is stored against your account. Push and email delivery are not wired up
          yet.
        </span>
      </p>
    </>
  );
}
