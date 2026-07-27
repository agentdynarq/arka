/**
 * Notifications owns FR-19 (real-time transaction alerts) and FR-20
 * (security alerts: new devices, limit changes, account-affecting
 * incidents). "Real-time" at Phase 2 demo scale is a pollable inbox, not
 * push: no WebSocket or mobile push infrastructure exists, and building one
 * is out of scope for this window. Labelled here rather than silently
 * assumed, same honesty principle as `reVerificationResult.livenessSimulated`.
 */

export type NotificationKind = 'transaction' | 'security'

/**
 * One entry in a customer's inbox. `accountId` is set for a transaction
 * alert (which account moved money) and `null` for a security alert (not
 * tied to one account, for example a limit change or a new-payee step-up).
 */
export interface Notification {
  readonly notificationId: string
  readonly customerId: string
  readonly accountId: string | null
  readonly kind: NotificationKind
  readonly title: string
  readonly message: string
  readonly createdAt: string
  readonly readAt: string | null
}

export type NewNotification = Omit<Notification, 'notificationId' | 'createdAt' | 'readAt'>

export type NotificationsErrorCode = 'NOTIFICATION_NOT_FOUND'

export class NotificationsError extends Error {
  readonly code: NotificationsErrorCode

  constructor(code: NotificationsErrorCode, message: string) {
    super(message)
    this.name = 'NotificationsError'
    this.code = code
  }
}
