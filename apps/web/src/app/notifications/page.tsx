'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchNotifications, markNotificationRead, ApiError } from '@/lib/api'
import type { AppNotification } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'
import { PageHeader, Panel, StatusWord, Skeleton, EmptyState, Alert, InboxIcon, Button } from '@arka/ui'

function dayKeyFor(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/**
 * FR-19 (transaction alerts) and FR-20 (security alerts): a pollable inbox,
 * not push, at Phase 2 demo scale, labelled as such in
 * `services/notifications/README.md`.
 */
export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [markingAll, setMarkingAll] = useState(false)

  useEffect(() => {
    const accessToken = getAccessToken()
    if (!accessToken) {
      router.replace('/reverify')
      return
    }
    fetchNotifications(accessToken)
      .then(setNotifications)
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : 'Could not load notifications')
        clearSession()
      })
  }, [router])

  async function markRead(notificationId: string) {
    const accessToken = getAccessToken()
    if (!accessToken || !notifications) return
    try {
      const updated = await markNotificationRead(accessToken, notificationId)
      setNotifications(notifications.map((n) => (n.notificationId === notificationId ? updated : n)))
    } catch {
      // Read state is a convenience, not a correctness concern: a failed mark-as-read
      // leaves the item visibly unread rather than silently losing the notification.
    }
  }

  async function markAllRead() {
    const accessToken = getAccessToken()
    if (!accessToken || !notifications) return
    const unread = notifications.filter((n) => !n.readAt)
    if (unread.length === 0) return
    setMarkingAll(true)
    try {
      const updates = await Promise.all(unread.map((n) => markNotificationRead(accessToken, n.notificationId)))
      const byId = new Map(updates.map((u) => [u.notificationId, u]))
      setNotifications(notifications.map((n) => byId.get(n.notificationId) ?? n))
    } catch {
      // Same as markRead: best-effort, a partial failure just leaves some items unread.
    } finally {
      setMarkingAll(false)
    }
  }

  const groups = useMemo(() => {
    const map = new Map<string, AppNotification[]>()
    for (const n of notifications ?? []) {
      const key = dayKeyFor(n.createdAt)
      const list = map.get(key)
      if (list) list.push(n)
      else map.set(key, [n])
    }
    return Array.from(map.entries())
  }, [notifications])

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0

  return (
    <>
      <PageHeader
        breadcrumb="Arka / Notifications"
        title="Notifications"
        context="Transaction and security alerts, newest first."
        action={
          unreadCount > 0 ? (
            <Button variant="secondary" fullWidth={false} disabled={markingAll} onClick={markAllRead}>
              {markingAll ? 'Marking...' : 'Mark all as read'}
            </Button>
          ) : undefined
        }
      />

      <Panel>
        {error && <Alert>{error}</Alert>}
        {notifications === null && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height="56px" />
            <Skeleton height="56px" />
            <Skeleton height="56px" />
          </div>
        )}
        {notifications?.length === 0 && <EmptyState icon={<InboxIcon />} title="No notifications yet" hint="Transaction and security alerts will show up here." />}

        {groups.map(([day, items]) => (
          <div className="ui-day-group" key={day}>
            <p className="ui-day-group__heading">{day}</p>
            {items.map((n) => (
              <div className="ui-notif-row" key={n.notificationId} data-unread={!n.readAt}>
                <span className="ui-notif-row__dot" aria-hidden="true" />
                <div className="ui-notif-row__body">
                  <div className="ui-notif-row__title">{n.title}</div>
                  <div className="ui-notif-row__meta">{n.message}</div>
                </div>
                <StatusWord tone={n.kind === 'security' ? 'warning' : 'neutral'}>{n.kind}</StatusWord>
                <div className="ui-notif-row__time">{new Date(n.createdAt).toLocaleString()}</div>
                <div className="ui-notif-row__actions">
                  {!n.readAt && (
                    <button type="button" className="ui-copy-control" onClick={() => markRead(n.notificationId)}>
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </Panel>
    </>
  )
}
