import { test, describe } from 'node:test'
import assert from 'node:assert/strict'

import { NotificationsService } from '../src/service.ts'
import { InMemoryNotificationStore } from '../src/memory-notification-store.ts'
import { NotificationsError } from '../src/types.ts'

function newNotifications(): { notifications: NotificationsService; store: InMemoryNotificationStore } {
  const store = new InMemoryNotificationStore()
  return { notifications: new NotificationsService({ store }), store }
}

describe('notifyTransaction (FR-19)', () => {
  test('a debit reads as money sent', async () => {
    const { notifications } = newNotifications()
    const n = await notifications.notifyTransaction({
      customerId: 'cust-alice',
      accountId: 'customer:alice',
      direction: 'debit',
      amountMinorUnits: 5000n,
      counterpartyHint: 'customer:bob',
      ledgerBlockHash: 'a'.repeat(64),
    })

    assert.equal(n.kind, 'transaction')
    assert.equal(n.title, 'Money sent')
    assert.match(n.message, /50\.00.*customer:bob/)
    assert.equal(n.accountId, 'customer:alice')
    assert.equal(n.readAt, null)
  })

  test('a credit reads as money received', async () => {
    const { notifications } = newNotifications()
    const n = await notifications.notifyTransaction({
      customerId: 'cust-bob',
      accountId: 'customer:bob',
      direction: 'credit',
      amountMinorUnits: 5000n,
      counterpartyHint: 'customer:alice',
      ledgerBlockHash: 'a'.repeat(64),
    })

    assert.equal(n.title, 'Money received')
    assert.match(n.message, /50\.00.*customer:alice/)
  })

  test('formats large amounts exactly, past what a float could hold', async () => {
    const { notifications } = newNotifications()
    const huge = 9_007_199_254_740_993n // Number.MAX_SAFE_INTEGER + 2
    const n = await notifications.notifyTransaction({
      customerId: 'cust-alice',
      accountId: 'customer:alice',
      direction: 'debit',
      amountMinorUnits: huge,
      counterpartyHint: 'customer:bob',
      ledgerBlockHash: 'a'.repeat(64),
    })
    assert.match(n.message, /90071992547409\.93/)
  })
})

describe('notifySecurity (FR-20)', () => {
  test('is not tied to any account', async () => {
    const { notifications } = newNotifications()
    const n = await notifications.notifySecurity('cust-alice', 'Daily limit changed', 'Your daily limit is now 500.00.')

    assert.equal(n.kind, 'security')
    assert.equal(n.accountId, null)
    assert.equal(n.title, 'Daily limit changed')
  })
})

describe('listForCustomer', () => {
  test('newest first', async () => {
    const { notifications } = newNotifications()
    await notifications.notifySecurity('cust-alice', 'first', 'first message')
    await notifications.notifySecurity('cust-alice', 'second', 'second message')

    const list = await notifications.listForCustomer('cust-alice')
    assert.equal(list[0]!.title, 'second')
    assert.equal(list[1]!.title, 'first')
  })

  test('only returns notifications for the requested customer', async () => {
    const { notifications } = newNotifications()
    await notifications.notifySecurity('cust-alice', 'alice-only', 'x')
    await notifications.notifySecurity('cust-bob', 'bob-only', 'x')

    const list = await notifications.listForCustomer('cust-alice')
    assert.equal(list.length, 1)
    assert.equal(list[0]!.title, 'alice-only')
  })

  test('respects a limit', async () => {
    const { notifications } = newNotifications()
    for (let i = 0; i < 5; i++) await notifications.notifySecurity('cust-alice', `n${i}`, 'x')
    assert.equal((await notifications.listForCustomer('cust-alice', 2)).length, 2)
  })
})

describe('markRead', () => {
  test('sets readAt on an existing notification', async () => {
    const { notifications } = newNotifications()
    const created = await notifications.notifySecurity('cust-alice', 'title', 'message')
    assert.equal(created.readAt, null)

    const read = await notifications.markRead(created.notificationId)
    assert.ok(read.readAt)
  })

  test('throws for an unknown notification id', async () => {
    const { notifications } = newNotifications()
    await assert.rejects(
      () => notifications.markRead('nonexistent'),
      (e: unknown) => e instanceof NotificationsError && e.code === 'NOTIFICATION_NOT_FOUND'
    )
  })
})

describe('every notification is also written to the outbox, in the same call', () => {
  test('the store records both the notification and its event together', async () => {
    const { notifications, store } = newNotifications()
    await notifications.notifyTransaction({
      customerId: 'cust-alice',
      accountId: 'customer:alice',
      direction: 'debit',
      amountMinorUnits: 100n,
      counterpartyHint: 'customer:bob',
      ledgerBlockHash: 'a'.repeat(64),
    })

    const pending = await store.pendingEvents()
    assert.equal(pending.length, 1)
    assert.equal(pending[0]!.type, 'notification.transaction')
  })

  test('markEventsPublished stops an event from being relayed again', async () => {
    const { notifications, store } = newNotifications()
    await notifications.notifySecurity('cust-alice', 'title', 'message')

    const [event] = await store.pendingEvents()
    await store.markEventsPublished([event!.eventId])

    assert.equal((await store.pendingEvents()).length, 0)
  })
})
