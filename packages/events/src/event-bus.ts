import type { DomainEvent } from './types.ts'

/** One delivery of an event to a consumer group. `messageId` is the bus's own delivery id, not `event.eventId`. */
export interface StreamMessage {
  readonly messageId: string
  readonly event: DomainEvent
}

/**
 * A stream-of-events primitive, modelled directly on Redis Streams'
 * consumer groups rather than a generic pub/sub: `readGroup` is a pull, the
 * same shape `XREADGROUP` actually has, not a callback the bus owns the loop
 * for. That makes it possible to test deterministically (call it, get back
 * what is currently available, assert on it) instead of needing a running
 * background loop even in a unit test.
 *
 * Delivery is at-least-once. A message not acknowledged (a consumer crashed
 * after reading it but before calling `ack`) is redelivered. Consumers must
 * therefore be idempotent by `event.eventId`, never by `messageId`.
 */
export interface EventBus {
  publish(streamName: string, event: DomainEvent): Promise<void>

  /** Pull up to `count` messages not yet delivered to this consumer group. Creates the stream and group if needed. */
  readGroup(streamName: string, groupName: string, consumerName: string, count?: number): Promise<StreamMessage[]>

  /** Acknowledge messages as processed. An unacknowledged message is redelivered on a later `readGroup`. */
  ack(streamName: string, groupName: string, messageIds: readonly string[]): Promise<void>
}
