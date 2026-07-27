import type { DomainEvent } from './types.ts'

/**
 * Where a service stages events it has written, before a relay publishes
 * them to the event bus. `write` is the half of the contract that matters
 * most: an implementation backed by a real database must support writing
 * within the caller's own transaction, so the event and the state change
 * that produced it commit or roll back together. See `PgOutboxWriter`.
 */
export interface OutboxWriter {
  write(event: DomainEvent): Promise<void>

  /** Unpublished events, oldest first. */
  pending(limit?: number): Promise<DomainEvent[]>

  /** Mark events as published, so a relay does not send them again. */
  markPublished(eventIds: readonly string[]): Promise<void>
}
