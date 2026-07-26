# 0004. Redis Streams as the event backbone for Phase 2

**Status:** Accepted
**Date:** 26 July 2026

## Context

The Phase 1 blueprint names managed Kafka as the design target for the event backbone, with Redis
Streams as the Phase 2 substitute at demonstration scale. Phase 2 has five working days, two people,
and no deployed environment. The judging criteria reward server-side handling and architecture, not
broker selection.

## Decision

Use Redis Streams as the event backbone for Phase 2, with the outbox pattern on write and idempotent
consumers keyed on event id.

The semantics that matter are preserved: at-least-once delivery, consumer groups, and replay. The
outbox is what actually provides the correctness guarantee, not the broker. A domain event is written
into the outbox table in the same transaction as the state change that produced it, and a worker
publishes from there.

Kafka remains the design target for production scale and is documented as such.

## Alternative considered

Running Kafka locally in Docker Compose for fidelity with the blueprint.

Rejected on cost. Kafka adds significant memory footprint and startup time to a compose stack that
already has to bring up two full Cells on a laptop, and the risk that a judge cannot start the system
outweighs the fidelity gained. Nothing in the design depends on a Kafka-specific capability.

## Consequences

Accepted costs. Redis Streams has weaker durability guarantees than Kafka and different operational
characteristics at scale. Throughput headroom is lower. Migrating later means a real, if contained,
change to `packages/events`.

What is bought. The whole platform starts with one command, which is the single most important
property of a submission that gets run by a stranger.

Containment of the risk. All broker interaction is confined to `packages/events`. Services publish
and consume through that package's interface and never touch a Redis client directly, so the
substitution stays a one-package change.

Honesty note. This substitution was named in the Phase 1 submission rather than introduced quietly
here, and it is recorded in the divergences table in `docs/ARCHITECTURE.md`.
