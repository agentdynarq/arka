# @arka/notifications

Notifications for one Cell. Owns FR-19 (real-time transaction alerts) and FR-20 (security alerts: new
devices, limit changes, account-affecting incidents).

**"Real-time" at Phase 2 demo scale is a pollable inbox, not push.** No WebSocket or mobile push
infrastructure exists, and building one is out of scope for this window. Labelled here rather than
silently assumed, the same honesty principle as `reVerificationResult.livenessSimulated`.

Framework-free, same reasoning as every other service in this repo: the behaviour that decides what a
customer is told is testable without a server or a database.

## Running it

```bash
npm test         # unit tests always run; the Postgres suite skips without a live database
npm run typecheck
```

Bring up `docker compose up` from the repo root first to also exercise `pg-store.integration.test.ts`
against a real Cell 1 Postgres.

## The first real consumer of `@arka/events`

Every other service in this repo predates `@arka/events`, so retrofitting the outbox pattern into
already-shipped ledger and payments write paths is scoped as follow-up work (see that package's
README). Notifications is new, built with the guarantee from day one instead: `create` writes the
notification row and its outbox event on one Postgres client, inside one transaction. Proven in
`pg-store.integration.test.ts`, not asserted.

```ts
notifyTransaction({ customerId, accountId, direction, amountMinorUnits, counterpartyHint, ledgerBlockHash })
notifySecurity(customerId, title, message)
listForCustomer(customerId, limit?)
markRead(notificationId)
```

`notifyTransaction` is called once per side of a transfer (`apps/identity`'s `TransfersController`
calls it twice), so both the sender and the receiver are told, matching "every transaction" rather than
only the account that initiated it. `notifySecurity` is not tied to any account (`accountId: null`):
a limit change or a step-up-gated new payee are facts about a customer, not one account.

## A real bug, caught by a burst, not by the type checker

`listForCustomer` originally sorted by `createdAt.localeCompare`. Two notifications created within the
same millisecond get an identical ISO string, and a string sort on a tie falls back to stable sort's
original array order, the opposite of "newest first" the moment two notifications land close together
(exactly the case when both sides of a transfer are notified in the same request). A test that created
ten notifications back to back caught it immediately. Fixed by ordering on insertion order directly:
the in-memory store reverses `Map` iteration order, and the Postgres store adds a `bigserial seq`
column as the tiebreaker, both collision-free regardless of clock resolution.

## Tests

| Suite | Covers |
|---|---|
| `service.test.ts` | Transaction and security notifications, formatting (including past float-safe range), customer isolation, `markRead`, and that every `create` call also lands an outbox event |
| `pg-store.integration.test.ts` | The same, against real Postgres, plus the same-transaction guarantee and the ten-in-a-burst ordering fix |
