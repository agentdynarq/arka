import { randomUUID } from 'node:crypto'
import { NotificationsError } from './types.ts'
import type { Notification } from './types.ts'
import type { NotificationStore } from './notification-store.ts'
import type { Direction } from '@arka/ledger'

export interface NotificationsServiceOptions {
  readonly store: NotificationStore
}

/**
 * Notifications for one Cell. Framework-free, same reasoning as every other
 * service: the behaviour that decides what a customer is told is testable
 * without a server or a database. Owns FR-19 and FR-20.
 */
export class NotificationsService {
  readonly #store: NotificationStore

  constructor(options: NotificationsServiceOptions) {
    this.#store = options.store
  }

  /**
   * FR-19: a transaction alert. Called once per side of a transfer, so both
   * the sender and the receiver are notified, matching "every transaction"
   * rather than only the account that initiated it.
   */
  async notifyTransaction(options: {
    readonly customerId: string
    readonly accountId: string
    readonly direction: Direction
    readonly amountMinorUnits: bigint
    readonly counterpartyHint: string
    readonly ledgerBlockHash: string
  }): Promise<Notification> {
    const verb = options.direction === 'debit' ? 'sent to' : 'received from'
    const title = options.direction === 'debit' ? 'Money sent' : 'Money received'
    const message = `${formatMinorUnits(options.amountMinorUnits)} ${verb} ${options.counterpartyHint}.`

    return this.#store.create(
      {
        customerId: options.customerId,
        accountId: options.accountId,
        kind: 'transaction',
        title,
        message,
      },
      {
        eventId: randomUUID(),
        type: 'notification.transaction',
        occurredAt: new Date().toISOString(),
        payload: {
          customerId: options.customerId,
          accountId: options.accountId,
          direction: options.direction,
          amountMinorUnits: options.amountMinorUnits.toString(),
          counterpartyHint: options.counterpartyHint,
          ledgerBlockHash: options.ledgerBlockHash,
        },
      }
    )
  }

  /**
   * FR-20: a security alert, not tied to one account. New devices, limit
   * changes, and other account-affecting incidents that are not themselves a
   * transaction.
   */
  async notifySecurity(customerId: string, title: string, message: string): Promise<Notification> {
    return this.#store.create(
      { customerId, accountId: null, kind: 'security', title, message },
      {
        eventId: randomUUID(),
        type: 'notification.security',
        occurredAt: new Date().toISOString(),
        payload: { customerId, title, message },
      }
    )
  }

  async listForCustomer(customerId: string, limit?: number): Promise<Notification[]> {
    return this.#store.listForCustomer(customerId, limit)
  }

  async markRead(notificationId: string): Promise<Notification> {
    const existing = await this.#store.get(notificationId)
    if (!existing) {
      throw new NotificationsError('NOTIFICATION_NOT_FOUND', `No notification "${notificationId}"`)
    }
    await this.#store.markRead(notificationId, new Date().toISOString())
    return { ...existing, readAt: new Date().toISOString() }
  }
}

/** Minor units to a decimal string for a human-readable alert, never used for arithmetic. */
function formatMinorUnits(value: bigint): string {
  const negative = value < 0n
  const abs = negative ? -value : value
  const whole = abs / 100n
  const cents = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${cents}`
}
