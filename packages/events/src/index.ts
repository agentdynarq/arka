/**
 * The outbox and event bus primitives: "every write that others must learn
 * about goes through the outbox, written in the same transaction as the
 * state change. Consumers dedupe on event id" (CLAUDE.md's hard invariants).
 */

export type { DomainEvent } from './types.ts'

export type { OutboxWriter } from './outbox-writer.ts'
export { InMemoryOutboxWriter } from './memory-outbox-writer.ts'
export { PgOutboxWriter } from './pg-outbox-writer.ts'

export type { EventBus, StreamMessage } from './event-bus.ts'
export { InMemoryEventBus } from './memory-event-bus.ts'
export { RedisStreamEventBus } from './redis-event-bus.ts'

export { relayPendingEvents } from './outbox-relay.ts'
