/**
 * Runs against the real Cell 1 Postgres from docker-compose.yml. Skips with a
 * clear reason, rather than failing, when nothing is listening.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { isPostgresReachable } from '@arka/ledger'
import type { DomainEvent } from '@arka/events'

import { PgNotificationStore } from '../src/pg-notification-store.ts'
import type { NewNotification } from '../src/types.ts'

const CONNECTION_STRING =
  process.env.TEST_CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

function notification(overrides: Partial<NewNotification> = {}): NewNotification {
  return {
    customerId: 'cust-alice',
    accountId: 'customer:alice',
    kind: 'transaction',
    title: 'Money sent',
    message: '50.00 sent to customer:bob.',
    ...overrides,
  }
}

function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: randomUUID(),
    type: 'notification.transaction',
    occurredAt: new Date().toISOString(),
    payload: {},
    ...overrides,
  }
}

const reachable = await isPostgresReachable(CONNECTION_STRING)

describe(
  'PgNotificationStore, against a real Postgres',
  { skip: reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first` },
  () => {
    let store: PgNotificationStore

    before(async () => {
      store = new PgNotificationStore(CONNECTION_STRING)
      await store.resetSchema()
    })

    after(async () => {
      await store.close()
    })

    test('create writes the notification and it reads back unchanged', async () => {
      const created = await store.create(notification(), event())
      const fetched = await store.get(created.notificationId)

      assert.deepEqual(fetched, created)
    })

    test('create also writes the outbox event, in the same call', async () => {
      const e = event({ eventId: randomUUID() })
      await store.create(notification(), e)

      const pending = await store.pendingEvents()
      assert.ok(pending.some((p) => p.eventId === e.eventId))
    })

    test(
      'ten notifications created back to back for the same customer still list newest first, ' +
        'even when several share the same millisecond timestamp',
      async () => {
        const customerId = `cust-burst-${randomUUID()}`
        const created = []
        for (let i = 0; i < 10; i++) {
          created.push(await store.create(notification({ customerId, title: `n${i}` }), event({ eventId: randomUUID() })))
        }

        const list = await store.listForCustomer(customerId, 10)
        assert.equal(list.length, 10)
        assert.equal(list[0]!.title, 'n9', 'the most recently created must be first')
        assert.equal(list[9]!.title, 'n0', 'the first created must be last')
      }
    )

    test('markRead sets readAt, persisted', async () => {
      const created = await store.create(notification(), event())
      assert.equal(created.readAt, null)

      const readAt = new Date().toISOString()
      await store.markRead(created.notificationId, readAt)

      const fetched = await store.get(created.notificationId)
      assert.equal(fetched!.readAt, readAt)
    })

    test('markEventsPublished removes an event from pending, permanently', async () => {
      const e = event({ eventId: randomUUID() })
      await store.create(notification(), e)
      await store.markEventsPublished([e.eventId])

      const pending = await store.pendingEvents()
      assert.ok(!pending.some((p) => p.eventId === e.eventId))
    })

    test('a get for an unknown id is null, not an error', async () => {
      assert.equal(await store.get('nonexistent'), null)
    })
  }
)
