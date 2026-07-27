# @arka/events

Outbox and Redis Streams event bus primitives. "Every write that others must learn about goes through
the outbox, written in the same transaction as the state change. Consumers dedupe on event id" (the
hard invariant in `CLAUDE.md`). Nobody had built this yet; it exists now as the foundation for
Notifications (FR-19, FR-20), the first real consumer.

## Running it

```bash
npm test        # unit tests always run; the Postgres and Redis suites skip without live infrastructure
npm run typecheck
```

Bring up `docker compose up` from the repo root to exercise `pg-outbox-writer.integration.test.ts` and
`redis-event-bus.integration.test.ts` against real Cell 1 Postgres and Redis.

## Reusable, not a service

This package owns no schema and no stream naming convention. It provides the primitives; each service
that produces events owns its own outbox table (in its own Postgres schema, per
`docs/ARCHITECTURE.md` section 1) and decides what stream names mean.

```ts
new PgOutboxWriter(connectionString, schemaName)   // schemaName is validated, never interpolated blindly
new RedisStreamEventBus(connectionUrl)
relayPendingEvents(outbox, bus, streamName)        // the worker CLAUDE.md describes
```

## The same-transaction guarantee is real, and tested

`PgOutboxWriter.writeWithClient(client, event)` takes an existing `pg` client, so a producing service can
write its own state change and the outbox row on the same client, inside the same `BEGIN`/`COMMIT`.
`pg-outbox-writer.integration.test.ts` proves this rather than asserting it: a test transaction inserts a
probe row and an outbox event on the same client, then rolls back, and the test confirms the outbox row is
gone too. A second test commits the same shape and confirms both rows survive. Retrofitting this into
already-shipped ledger and payments write paths is scoped as follow-up work, not done in this package;
`services/notifications` is the first consumer built with it from scratch, so its own writes get the
guarantee for real from day one. See its README.

## `readGroup` is a pull, modelled on `XREADGROUP`, not a callback loop

```ts
publish(streamName, event): Promise<void>
readGroup(streamName, groupName, consumerName, count?): Promise<StreamMessage[]>
ack(streamName, groupName, messageIds): Promise<void>
```

Delivery is at-least-once. A message a consumer read but never acknowledged (crashed mid-processing) is
redelivered on a later `readGroup` call. Consumers must therefore be idempotent by `event.eventId`, never
by `messageId` (the bus's own delivery id, which changes on redelivery in real Redis).

### A real bug this shape caught

`RedisStreamEventBus.readGroup` originally issued a single `XREADGROUP ... '>'` call. That is Redis's
cursor for "never delivered to this group before"; it does **not** resurface a message this consumer
already received but never acknowledged. The first version passed against the in-memory bus (which does
redeliver unacked pending messages) and failed the moment it ran against real Redis: the redelivery test
got zero messages back instead of one. Fixed by reading the consumer's own pending list (cursor `'0'`)
first, then topping up with genuinely new messages (`'>'`), the standard Redis Streams recovery pattern.
Left as a documented lesson in the method's own comment, not just a silent fix, since it is exactly the
kind of gap only a real Redis instance exposes, never a type checker or an in-memory double alone.

## Tests

| Suite | Covers |
|---|---|
| `outbox-writer.test.ts` | In-memory outbox: write, pending, markPublished, ordering |
| `event-bus.test.ts` | In-memory bus: publish, redelivery of the unacknowledged, independent consumer groups |
| `outbox-relay.test.ts` | The relay end to end, plus a full outbox-to-bus-to-idempotent-consumer scenario proving a crashed, unacked consumer sees the same event again and dedupes it by `eventId` |
| `pg-outbox-writer.integration.test.ts` | Real Postgres, including the same-transaction rollback and commit proof above |
| `redis-event-bus.integration.test.ts` | Real Redis Streams: publish, redelivery, acknowledgement, independent groups |
