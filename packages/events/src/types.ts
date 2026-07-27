/**
 * The outbox and event bus primitives. "Every write that others must learn
 * about goes through the outbox, written in the same transaction as the
 * state change. Consumers dedupe on event id" (CLAUDE.md's hard invariants).
 * This package is that primitive, reusable by any service, deliberately
 * separate from owning any one service's schema.
 */

/** One fact that happened, worth telling other services about. */
export interface DomainEvent<T = unknown> {
  readonly eventId: string
  readonly type: string
  readonly occurredAt: string
  readonly payload: T
}
