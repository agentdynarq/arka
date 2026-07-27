import { Pool } from 'pg'
import { PgOutboxWriter } from '@arka/events'
import type { DomainEvent } from '@arka/events'
import { randomUUID } from 'node:crypto'
import type { NotificationStore } from './notification-store.ts'
import type { Notification, NewNotification } from './types.ts'

interface Row {
  notification_id: string
  customer_id: string
  account_id: string | null
  kind: string
  title: string
  message: string
  created_at: string
  read_at: string | null
}

function rowToNotification(row: Row): Notification {
  return {
    notificationId: row.notification_id,
    customerId: row.customer_id,
    accountId: row.account_id,
    kind: row.kind as Notification['kind'],
    title: row.title,
    message: row.message,
    createdAt: row.created_at,
    readAt: row.read_at,
  }
}

const SCHEMA_SQL = `
CREATE SCHEMA IF NOT EXISTS notifications;

CREATE TABLE IF NOT EXISTS notifications.notifications (
  seq              bigserial PRIMARY KEY,
  notification_id  text NOT NULL UNIQUE,
  customer_id      text NOT NULL,
  account_id       text,
  kind             text NOT NULL CHECK (kind IN ('transaction', 'security')),
  title            text NOT NULL,
  message          text NOT NULL,
  created_at       text NOT NULL,
  read_at          text
);

-- Ordered by seq, not created_at: two notifications created within the same
-- millisecond get identical ISO strings, and seq is the collision-free
-- tiebreaker, monotonic by insertion regardless of clock resolution.
CREATE INDEX IF NOT EXISTS notifications_by_customer ON notifications.notifications (customer_id, seq DESC);
`

/**
 * `NotificationStore` backed by one Cell's Postgres, in its own
 * `notifications` schema. `create` writes the notification row and its
 * outbox event on the same client, inside one transaction: this is the real,
 * from-scratch demonstration of the same-transaction guarantee `@arka/events`
 * provides, not a retrofit of already-shipped code.
 */
export class PgNotificationStore implements NotificationStore {
  readonly #pool: Pool
  readonly #outbox: PgOutboxWriter
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
    this.#outbox = new PgOutboxWriter(connectionString, 'notifications')
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async create(notification: NewNotification, event: DomainEvent): Promise<Notification> {
    await this.#ensureSchema()

    const record: Notification = {
      ...notification,
      notificationId: randomUUID(),
      createdAt: new Date().toISOString(),
      readAt: null,
    }

    const client = await this.#pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(
        `INSERT INTO notifications.notifications
           (notification_id, customer_id, account_id, kind, title, message, created_at, read_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          record.notificationId,
          record.customerId,
          record.accountId,
          record.kind,
          record.title,
          record.message,
          record.createdAt,
          record.readAt,
        ]
      )
      await this.#outbox.writeWithClient(client, event)
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }

    return record
  }

  async listForCustomer(customerId: string, limit = 50): Promise<Notification[]> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<Row>(
      `SELECT * FROM notifications.notifications WHERE customer_id = $1 ORDER BY seq DESC LIMIT $2`,
      [customerId, limit]
    )
    return rows.map(rowToNotification)
  }

  async get(notificationId: string): Promise<Notification | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<Row>(
      `SELECT * FROM notifications.notifications WHERE notification_id = $1`,
      [notificationId]
    )
    return rows[0] ? rowToNotification(rows[0]) : null
  }

  async markRead(notificationId: string, readAt: string): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(`UPDATE notifications.notifications SET read_at = $2 WHERE notification_id = $1`, [
      notificationId,
      readAt,
    ])
  }

  async pendingEvents(limit?: number): Promise<DomainEvent[]> {
    await this.#ensureSchema()
    return this.#outbox.pending(limit)
  }

  async markEventsPublished(eventIds: readonly string[]): Promise<void> {
    await this.#ensureSchema()
    await this.#outbox.markPublished(eventIds)
  }

  /** Drop and recreate the schema. Test and seed-reset use only. */
  async resetSchema(): Promise<void> {
    await this.#pool.query('DROP SCHEMA IF EXISTS notifications CASCADE')
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
    await this.#outbox.close()
  }
}
