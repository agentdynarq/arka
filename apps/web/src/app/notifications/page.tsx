'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchNotifications, markNotificationRead, ApiError } from '@/lib/api'
import type { AppNotification } from '@/lib/api'
import { getAccessToken, clearSession } from '@/lib/session'
import { Main, Panel, Row, Badge, Skeleton, EmptyState, Alert, InboxIcon } from '@arka/ui'

/**
 * FR-19 (transaction alerts) and FR-20 (security alerts) had a real backend
 * and an API surface (`GET /v1/notifications`) but no screen: the agent-cash
 * flow (W4) reads a customer's OTP from the same inbox in tests and via
 * curl, but nothing in this app ever let a real customer see it. This
 * closes that gap.
 *
 * A pollable inbox, not push, at Phase 2 demo scale; labelled as such in
 * `services/notifications/README.md`, same honesty principle as
 * `livenessSimulated`.
 */
export default function NotificationsPage() {
  const router = useRouter()
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <Main size="wide">
      <Panel title="Notifications" subtitle="FR-19 transaction alerts, FR-20 security alerts. Newest first.">
        {error && <Alert>{error}</Alert>}
        {notifications === null && !error && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton height="56px" />
            <Skeleton height="56px" />
            <Skeleton height="56px" />
          </div>
        )}
        {notifications?.length === 0 && <EmptyState icon={<InboxIcon />} title="No notifications yet" hint="Transaction and security alerts will show up here." />}
        {notifications?.map((n) => (
          <button
            key={n.notificationId}
            onClick={() => markRead(n.notificationId)}
            style={{ all: 'unset', display: 'block', width: '100%', cursor: n.readAt ? 'default' : 'pointer' }}
          >
            <Row
              title={n.title}
              meta={
                <>
                  {n.message}
                  <br />
                  {new Date(n.createdAt).toLocaleString()}
                </>
              }
              value={<Badge tone={n.kind === 'security' ? 'warning' : 'info'}>{n.kind}</Badge>}
              footnote={!n.readAt ? <Badge tone="neutral">Unread, tap to mark read</Badge> : null}
            />
          </button>
        ))}
      </Panel>
    </Main>
  )
}
