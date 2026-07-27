import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { InMemoryEventBus } from '../src/memory-event-bus.ts'
import type { DomainEvent } from '../src/types.ts'

function event(type = 'test.event'): DomainEvent {
  return { eventId: randomUUID(), type, occurredAt: new Date().toISOString(), payload: { ok: true } }
}

describe('InMemoryEventBus', () => {
  test('a published event is delivered to a group that reads afterward', async () => {
    const bus = new InMemoryEventBus()
    const e = event()
    await bus.publish('stream-a', e)

    const messages = await bus.readGroup('stream-a', 'group-1', 'consumer-1')
    assert.equal(messages.length, 1)
    assert.equal(messages[0]!.event.eventId, e.eventId)
  })

  test('an unacknowledged message is redelivered on the next read (at-least-once)', async () => {
    const bus = new InMemoryEventBus()
    await bus.publish('stream-a', event())

    const first = await bus.readGroup('stream-a', 'group-1', 'consumer-1')
    const second = await bus.readGroup('stream-a', 'group-1', 'consumer-1')

    assert.equal(first.length, 1)
    assert.equal(second.length, 1)
    assert.equal(first[0]!.messageId, second[0]!.messageId, 'the same delivery, redelivered, not a new one')
  })

  test('an acknowledged message is not redelivered', async () => {
    const bus = new InMemoryEventBus()
    await bus.publish('stream-a', event())

    const [message] = await bus.readGroup('stream-a', 'group-1', 'consumer-1')
    await bus.ack('stream-a', 'group-1', [message!.messageId])

    assert.equal((await bus.readGroup('stream-a', 'group-1', 'consumer-1')).length, 0)
  })

  test('two independent groups each see every message, acking in one does not affect the other', async () => {
    const bus = new InMemoryEventBus()
    await bus.publish('stream-a', event())

    const [messageA] = await bus.readGroup('stream-a', 'group-a', 'c1')
    await bus.ack('stream-a', 'group-a', [messageA!.messageId])

    const groupB = await bus.readGroup('stream-a', 'group-b', 'c1')
    assert.equal(groupB.length, 1, 'group-b never acked, so it still sees the message')
  })

  test('acking an unknown group is a no-op, not an error', async () => {
    const bus = new InMemoryEventBus()
    await bus.ack('stream-a', 'nonexistent-group', ['whatever'])
  })

  test('a new publish is delivered on the next read without redelivering already-acked messages', async () => {
    const bus = new InMemoryEventBus()
    const first = event('first')
    await bus.publish('stream-a', first)
    const [m1] = await bus.readGroup('stream-a', 'group-1', 'c1')
    await bus.ack('stream-a', 'group-1', [m1!.messageId])

    const second = event('second')
    await bus.publish('stream-a', second)

    const messages = await bus.readGroup('stream-a', 'group-1', 'c1')
    assert.equal(messages.length, 1)
    assert.equal(messages[0]!.event.eventId, second.eventId)
  })
})
