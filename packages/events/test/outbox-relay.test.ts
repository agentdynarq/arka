import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { InMemoryOutboxWriter } from '../src/memory-outbox-writer.ts'
import { InMemoryEventBus } from '../src/memory-event-bus.ts'
import { relayPendingEvents } from '../src/outbox-relay.ts'
import type { DomainEvent } from '../src/types.ts'

function event(): DomainEvent {
  return { eventId: randomUUID(), type: 'test.event', occurredAt: new Date().toISOString(), payload: {} }
}

describe('relayPendingEvents', () => {
  test('publishes every pending event and marks it published', async () => {
    const outbox = new InMemoryOutboxWriter()
    const bus = new InMemoryEventBus()
    const e1 = event()
    const e2 = event()
    await outbox.write(e1)
    await outbox.write(e2)

    const relayed = await relayPendingEvents(outbox, bus, 'stream-a')
    assert.equal(relayed, 2)
    assert.equal((await outbox.pending()).length, 0, 'relayed events must be marked published')

    const delivered = await bus.readGroup('stream-a', 'group-1', 'c1', 10)
    assert.equal(delivered.length, 2)
  })

  test('returns 0 and publishes nothing when there is no pending event', async () => {
    const outbox = new InMemoryOutboxWriter()
    const bus = new InMemoryEventBus()
    assert.equal(await relayPendingEvents(outbox, bus, 'stream-a'), 0)
  })

  test('a second relay call after new events land only relays the new ones', async () => {
    const outbox = new InMemoryOutboxWriter()
    const bus = new InMemoryEventBus()
    await outbox.write(event())
    await relayPendingEvents(outbox, bus, 'stream-a')

    await outbox.write(event())
    const relayed = await relayPendingEvents(outbox, bus, 'stream-a')
    assert.equal(relayed, 1)
  })
})

describe('the whole pattern together: outbox to bus to an idempotent consumer', () => {
  test('a consumer that crashes before acking sees the same event again, and dedupes it by eventId', async () => {
    const outbox = new InMemoryOutboxWriter()
    const bus = new InMemoryEventBus()
    const processedEventIds = new Set<string>()
    let processCount = 0

    const e = event()
    await outbox.write(e)
    await relayPendingEvents(outbox, bus, 'stream-a')

    // First consumer attempt processes the event but crashes before acking.
    const firstAttempt = await bus.readGroup('stream-a', 'notifications', 'worker-1')
    for (const message of firstAttempt) {
      if (processedEventIds.has(message.event.eventId)) continue
      processedEventIds.add(message.event.eventId)
      processCount++
      // Crashed here: never called ack.
    }

    // A second attempt (a restart, or another worker in the same group) sees
    // the same unacknowledged message again, at-least-once delivery.
    const secondAttempt = await bus.readGroup('stream-a', 'notifications', 'worker-1')
    assert.equal(secondAttempt.length, 1, 'the unacked message is redelivered')

    for (const message of secondAttempt) {
      if (processedEventIds.has(message.event.eventId)) continue // the dedupe that makes at-least-once safe
      processedEventIds.add(message.event.eventId)
      processCount++
    }
    await bus.ack('stream-a', 'notifications', secondAttempt.map((m) => m.messageId))

    assert.equal(processCount, 1, 'redelivered but only processed once, because the consumer dedupes by eventId')
  })
})
