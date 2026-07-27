import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { InMemoryOutboxWriter } from '../src/memory-outbox-writer.ts'
import type { DomainEvent } from '../src/types.ts'

function event(overrides: Partial<DomainEvent> = {}): DomainEvent {
  return {
    eventId: randomUUID(),
    type: 'test.event',
    occurredAt: new Date().toISOString(),
    payload: { ok: true },
    ...overrides,
  }
}

describe('InMemoryOutboxWriter', () => {
  test('a written event appears in pending', async () => {
    const outbox = new InMemoryOutboxWriter()
    const e = event()
    await outbox.write(e)

    const pending = await outbox.pending()
    assert.equal(pending.length, 1)
    assert.equal(pending[0]!.eventId, e.eventId)
  })

  test('pending respects a limit', async () => {
    const outbox = new InMemoryOutboxWriter()
    for (let i = 0; i < 5; i++) await outbox.write(event())
    assert.equal((await outbox.pending(2)).length, 2)
  })

  test('markPublished removes an event from pending', async () => {
    const outbox = new InMemoryOutboxWriter()
    const e = event()
    await outbox.write(e)
    await outbox.markPublished([e.eventId])

    assert.equal((await outbox.pending()).length, 0)
  })

  test('markPublished on an unknown id is a no-op, not an error', async () => {
    const outbox = new InMemoryOutboxWriter()
    await outbox.markPublished(['nonexistent'])
  })

  test('pending is oldest first', async () => {
    const outbox = new InMemoryOutboxWriter()
    const first = event()
    const second = event()
    await outbox.write(first)
    await outbox.write(second)

    const pending = await outbox.pending()
    assert.equal(pending[0]!.eventId, first.eventId)
    assert.equal(pending[1]!.eventId, second.eventId)
  })
})
