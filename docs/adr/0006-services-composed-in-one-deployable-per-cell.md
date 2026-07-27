# 0006. Identity, Accounts and Payments composed in one deployable for Phase 2

**Status:** Accepted
**Date:** 27 July 2026

## Context

`PHASE-2-PLAN.md`'s repository shape has one deployable per service (`services/identity`,
`services/accounts`, `services/payments`, each "deployed ONCE PER CELL"). Building the customer-facing
API surface exposed a real constraint that plan did not anticipate.

`IdentityService` keeps MFA challenges and step-up proofs in an in-process `Map`, not behind a Postgres
store (documented in `services/identity/README.md`: short-lived state that does not need to outlive a
login round trip, and Phase 2 runs one Identity instance per Cell). A step-up proof issued by that
instance exists only in that instance's memory. If Payments were its own separate deployable, verifying
a step-up token before a risky transfer would require a real network call to the specific running
Identity process that issued it, which then needs its own authentication (`@arka/workload-auth` exists
for exactly this, unused so far), plus handling for that call failing independently of the transfer
itself.

## Decision

For Phase 2, `apps/identity` is the one deployable per Cell that composes `IdentityService`,
`AccountsService`, `LedgerService` and `PaymentsService` together, in one Node process, via
`identity-provider.ts`. Every one of those framework-free service classes is unchanged and stays fully
testable in isolation; what changed is which process hosts them, not what they are.

Step-up verification (`IdentityService.verifyStepUpToken`) is called directly, in process, from
`apps/identity/src/payments/transfers.controller.ts`. No network hop, no new authentication surface
needed for an internal call that a single process can make as a plain method call.

## Alternative considered

A separate `apps/payments` deployable, with step-up verification as a new HTTP endpoint on
`apps/identity`, authenticated between the two processes with `@arka/workload-auth`.

Rejected for Phase 2 on cost, not correctness. It is the architecturally cleaner shape and is not
ruled out, it is deferred: it adds a second network hop, a second authentication surface to build and
test under this week's deadline, and a new failure mode (the step-up verification call itself failing)
for a boundary that exists only inside one Cell's own trust zone, where the Cell isolation model
(ADR 0001) already draws the line that actually matters for this platform's central claim.

## Consequences

Accepted costs. `apps/identity` is not accurately named for what it now hosts; it is the one
customer-facing API surface for a Cell, not only identity. Left as is rather than renamed mid-build,
to avoid unrelated churn across an already-merged app under deadline pressure. Worth a rename, or a
split back into separate deployables, when Phase 3's actual deployment work happens and the target
architecture's "one deployable per service" is worth its cost again.

Each service (`services/identity`, `services/accounts`, `services/ledger`, `services/payments`) remains
independently testable and independently correct regardless of what composes it; this decision changed
only `apps/identity`, the thin adapter layer, never the services themselves. The database-per-service
property (ADR 0001, `docs/ARCHITECTURE.md` section 1) is untouched: each service still owns only its
own Postgres schema, enforced identically whether one process or four call into it.

Follow-through. If a separate `apps/payments` deployable is built later, step-up verification needs a
real HTTP endpoint on `apps/identity` guarded by `@arka/workload-auth`, not the in-process call this
ADR accepts for now.
