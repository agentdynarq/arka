# Test strategy

Quality assurance is worth as much as functionality in the Phase 2 mark scheme. This document is the
strategy; the tests themselves are the evidence.

The governing principle: **test hardest where the cost of being wrong is highest.** In a bank that is
money correctness and integrity, not UI rendering.

## The pyramid

| Level | Scope | Where | Speed |
|---|---|---|---|
| Unit | Pure logic, no IO | `packages/ledger-core`, `packages/contracts`, domain services | Milliseconds, run on every save |
| Integration | A service against a real Postgres and Redis | `services/*` | Seconds, run on every commit |
| Contract | Gateway and services agree on the shapes in `packages/contracts` | Gateway boundary | Seconds |
| End to end | Two full journeys through the browser | `apps/web`, `apps/console` | Minutes, run in CI |

The two end-to-end journeys are chosen deliberately, because they are the two claims the whole
project rests on:

1. A customer re-verifies, passes MFA, sees a balance restored from the ledger, and transfers money.
2. An operator sees a degraded Cell, quarantines it under dual approval, and the other Cell keeps
   serving.

Implemented as real Playwright suites in `e2e/`, against `apps/web` and `apps/console` in a real
browser, built fresh and run against the full stack: `docker compose up` plus every app process. Not
a mock of the stack and not a relabelled integration test. Journey 2's "the other Cell keeps serving"
claim is checked the same way it was first verified manually (see `../arka-ops/LOG.md`, 29 July):
through `apps/gateway`'s write-check endpoint, since that is the actual enforcement point
(`docs/ARCHITECTURE.md` section 1), not a screen of its own. Run with `pnpm test:e2e`, or as CI job
`e2e` in `.github/workflows/ci.yml`.

## What gets tested hardest

`packages/ledger-core` carries the invariants everything else depends on. It has zero runtime
dependencies specifically so that it can be tested exhaustively and read quickly by a reviewer.

Each of these is a named test:

- Every block balances: the sum of debits equals the sum of credits, and an unbalanced block is
  rejected at construction.
- The chain links: `block.prevHash` equals the previous block's hash, and `seq` increments by exactly
  one. A gap or a fork is rejected.
- Tampering is detected **and located**. Mutating any historical entry makes verification fail and
  report the correct index. It is not enough to know something broke.
- Balances replayed from genesis equal the stored projection. This is what makes a projection safe to
  throw away and rebuild.
- Money is `bigint` minor units throughout. A test asserts no float can enter the API surface.

## Money movement

- **Idempotency.** The same payment request fired twice moves money exactly once and returns the same
  result both times. This is tested at the integration level against a real database, because the
  guarantee lives in a uniqueness constraint, not in application logic.
- **Saga compensation.** A multi-step transfer with an injected failure at each step leaves no money
  in limbo. One test per failure point.
- **Concurrency.** Parallel transfers from the same account cannot overdraw it.

## Authentication

Authentication is a 15% bucket of its own, so it is tested as a subsystem rather than as a login form.

- Passwords are hashed with Argon2 and never logged, never returned, never compared in variable time.
- Sessions expire. Refresh tokens rotate and a reused refresh token invalidates the family.
- MFA is required and cannot be skipped by calling the API directly.
- Step-up triggers on a new payee, an over-limit amount and an unrecognised device, and the underlying
  action cannot execute without it.
- RBAC: a customer token cannot reach an operator endpoint, and an operator token cannot read
  customer funds.
- Login rate limiting and account lockout both engage under a scripted burst.

## Isolation

The claim that makes Arka what it is, so it gets an explicit test rather than an assertion in a
document.

- No credential in Cell 1's configuration authenticates against Cell 2's database or Redis.
- No service source file branches on `CELL_ID`.
- A quarantined Cell rejects writes and continues to serve reads, while the other Cell is unaffected.

## CI gates

Every gate blocks the merge. A gate that warns is not a gate.

| Gate | Fails the build when | Wired in CI |
|---|---|---|
| Typecheck | Any TypeScript error, no `any` escapes in `packages/` | Yes, job `typecheck-and-test` |
| Unit and integration tests | Any failure | Yes, job `typecheck-and-test` |
| Coverage | `packages/ledger-core` below 100% branch coverage | Yes, `pnpm coverage` in job `typecheck-and-test` |
| Dependency audit | Any known high or critical vulnerability | Yes, job `dependency-audit`, `pnpm audit --audit-level high` |
| Secret scan | Any credential-shaped string in the diff | Yes, job `secret-scan`, gitleaks |
| End to end | Either critical journey breaking through a real browser | Yes, job `e2e` |
| Lint and format | Style drift | Not yet. Every package's `lint` script is a stated stub, not silently skipped |

Lint is the one gate in this table not actually enforced. Naming it as deferred here is the same
discipline as the deferred FR list in `PHASE-2-PLAN.md`: a gap that is named is a scope decision, one
that is not named is a surprise for whoever finds it.

## Test data

`scripts/seed.ts` produces deterministic demo data that matches the Phase 1 wireframes, so a
reviewer, a test and a screenshot all describe the same bank. Randomised fixtures are used only where
the property under test is genuinely general, such as chain verification over arbitrary block counts.

## What is not tested, and why

Load testing to the per-Cell throughput target and the accessibility audit are Phase 3 work, run
against a deployed environment. Stating that here is more useful than a shallow benchmark run on a
laptop and presented as a result.
