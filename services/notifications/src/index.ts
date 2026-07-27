/**
 * Notifications for one Cell. Owns FR-19 (transaction alerts) and FR-20
 * (security alerts). The first real consumer of `@arka/events`'
 * same-transaction outbox guarantee, built with it from scratch rather than
 * retrofitted onto already-shipped code.
 */

export { NotificationsService } from './service.ts'
export type { NotificationsServiceOptions } from './service.ts'

export { NotificationsError } from './types.ts'
export type { Notification, NewNotification, NotificationKind, NotificationsErrorCode } from './types.ts'

export type { NotificationStore } from './notification-store.ts'
export { InMemoryNotificationStore } from './memory-notification-store.ts'
export { PgNotificationStore } from './pg-notification-store.ts'
