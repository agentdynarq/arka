# Arka — glossary

Ubiquitous language for this codebase. Terms only, no implementation detail. If a concept here has a
name, use that name in code, in commits, in the UI and in conversation. If you need a new concept,
add it here first.

## The platform

**Arka** — the banking platform. Tagline: "Banking that survives." Named for the ark, the vessel that
outlives the flood.

**Cell** — an independent, self-contained deployment of the full Arka service stack serving one shard
of customers. The unit of blast-radius containment: a compromise of one Cell cannot reach another. A
Cell is produced by configuration, never by a code branch.

**Cell Router** — the component inside the gateway that maps a customer to their Cell by stable hash.
The only place in the system that knows more than one Cell exists.

**Control plane** — the separate trust zone that observes and rebuilds Cells. Holds no customer data.
Cells have no path back into it.

**Recovery Console** — the bank operator's interface for observing Cell health, quarantining a
compromised Cell, and verifying ledger integrity. Distinct from the customer app.

## Money and truth

**Ledger** — Arka's append-only, hash-chained, double-entry record of all money movement. The single
source of financial truth. Everything else is a rebuildable projection of it.

**Block** — one append to the ledger. Carries a sequence number, the hash of its predecessor, its
entries, a timestamp, and its own hash.

**Entry** — a single debit or credit against one account, in minor units. Every Block balances: the
sum of its debits equals the sum of its credits.

**Projection** — any derived read model built by replaying the ledger. Balances and transaction
history are projections. A projection can always be thrown away and rebuilt.

**Minor units** — the smallest indivisible unit of the currency, held as `bigint`. All money in Arka
is expressed this way. There is no float representation of money anywhere in the system.

## Movement and safety

**Idempotency Key** — the client-supplied identifier on a payment request. The same key returns the
same stored result and never executes twice.

**Outbox** — the table a domain event is written to inside the same transaction as the state change
that produced it. A worker publishes from it. This is how at-least-once delivery happens without
double execution.

**Saga** — the orchestration of a multi-step money movement, with a compensating action for each step,
so no failure leaves money in limbo.

**Step-up authentication** — an additional proof demanded at the moment of a risky action (a new
payee, an over-limit amount, an unrecognised device) rather than at login.

**Workload identity** — the short-lived credential a service presents to prove what it is on a
service-to-service call. A process that cannot prove who it is talks to nothing.

## Operations

**Quarantine** — the operator action that flips one Cell to read-only, freezing egress and holding
non-critical writes, while every other Cell keeps serving. Requires dual approval.

**Dual approval** — the requirement that two distinct operators authorise an action before it takes
effect. Applies to quarantine.

**Quorum Ceremony** — the key-recovery procedure requiring 3 of 5 independent keyholders to
reconstruct a signing key. Arka's answer to the scenario's Master Key: no single artifact can unlock
the system.

**Audit trail** — the append-only, hash-chained record of every operator action. Uses the same
primitive as the Ledger.

**Integrity verification** — walking the hash chain to prove no historical record has been altered,
producing exportable evidence.

## Inclusion

**Agent** — an authorised human who performs cash-in and cash-out on behalf of a customer, with the
customer consenting by OTP.

**Offline voucher** — a signed payment instrument a customer generates without connectivity, which a
merchant redeems once when connectivity returns.

**Low-bandwidth mode** — the lighter rendering path that keeps core journeys usable on slow
connections and older devices.

## The competition

**RECON / REBUILD / FORTIFY** — Duothan's three phases. Blueprint (Phase 1, submitted, placed
second), build (Phase 2, this repo), deploy and defend on-site (Phase 3, 6 August 2026).

**FR-xx / NFR-xx** — functional and non-functional requirement identifiers from the Phase 1
submission. Traceability is in `docs/ARCHITECTURE.md`. Eighteen FRs are priority Must and are the
scope commitment for Phase 2.

**W1 to W6** — the six wireframe screens from Phase 1. W1 re-verification, W2 dashboard, W3 transfer,
W4 agent and offline, W5 cell health map, W6 ledger integrity audit.
