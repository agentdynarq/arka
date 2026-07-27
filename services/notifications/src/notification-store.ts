import type { DomainEvent } from '@arka/events'
import type { Notification, NewNotification } from './types.ts'

/**
 * Where a customer's notifications live, and where each one is written
 * alongside its outbox event, in one transaction. The event is not optional:
 * every notification this service creates is also a fact worth telling a
 * future consumer about (a real-time push channel, when one exists), so the
 * outbox write is part of `create`'s own contract, not a separate step a
 * caller could forget.
 */
export interface NotificationStore {
  create(notification: NewNotification, event: DomainEvent): Promise<Notification>

  listForCustomer(customerId: string, limit?: number): Promise<Notification[]>

  get(notificationId: string): Promise<Notification | null>

  markRead(notificationId: string, readAt: string): Promise<void>

  /** Events not yet relayed to the bus, oldest first. The outbox half of the same contract `create` writes to. */
  pendingEvents(limit?: number): Promise<DomainEvent[]>

  markEventsPublished(eventIds: readonly string[]): Promise<void>
}
