import { randomUUID } from 'node:crypto'
import { InMemoryOutboxWriter } from '@arka/events'
import type { DomainEvent } from '@arka/events'
import type { NotificationStore } from './notification-store.ts'
import type { Notification, NewNotification } from './types.ts'

/** In-memory `NotificationStore`, used by unit tests. Backs the outbox half with `InMemoryOutboxWriter`, same contract as the Postgres implementation. */
export class InMemoryNotificationStore implements NotificationStore {
  readonly #notifications = new Map<string, Notification>()
  readonly #outbox = new InMemoryOutboxWriter()

  async create(notification: NewNotification, event: DomainEvent): Promise<Notification> {
    const record: Notification = {
      ...notification,
      notificationId: randomUUID(),
      createdAt: new Date().toISOString(),
      readAt: null,
    }
    this.#notifications.set(record.notificationId, record)
    await this.#outbox.write(event)
    return record
  }

  async listForCustomer(customerId: string, limit?: number): Promise<Notification[]> {
    // Reverses Map insertion order rather than sorting by createdAt: two
    // notifications created within the same millisecond get identical ISO
    // strings, and a string sort on a tie falls back to stable-sort's
    // original array order, the opposite of "newest first". Insertion order
    // has no such collision.
    const forCustomer = [...this.#notifications.values()].reverse().filter((n) => n.customerId === customerId)
    return limit === undefined ? forCustomer : forCustomer.slice(0, limit)
  }

  async get(notificationId: string): Promise<Notification | null> {
    return this.#notifications.get(notificationId) ?? null
  }

  async markRead(notificationId: string, readAt: string): Promise<void> {
    const existing = this.#notifications.get(notificationId)
    if (existing) this.#notifications.set(notificationId, { ...existing, readAt })
  }

  async pendingEvents(limit?: number): Promise<DomainEvent[]> {
    return this.#outbox.pending(limit)
  }

  async markEventsPublished(eventIds: readonly string[]): Promise<void> {
    await this.#outbox.markPublished(eventIds)
  }
}
