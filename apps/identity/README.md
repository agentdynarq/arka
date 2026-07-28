# @arka/identity-app

HTTP adapter for one Cell's customer-facing API: identity, authentication, and (see docs/adr/0006)
payments and account history composed into the same deployable. Thin on purpose: everything that
decides who is authenticated and what they may do lives in `@arka/identity`, `@arka/accounts` and
`@arka/payments`; this app is NestJS controllers, a bearer token guard, and request validation.

## Running it

```bash
docker compose up            # from the repo root, brings up Cell 1 and Cell 2 Postgres and Redis
pnpm seed                    # from the repo root, seeds ledger and account data (customer:alice etc.)
pnpm --filter @arka/identity-app build
pnpm --filter @arka/identity-app start
```

Reads `DATABASE_URL` (falls back to Cell 1's local compose port), `CELL_ID` (default `cell-1`),
`IDENTITY_PORT` (default `3001`), and `RECOVERY_URL` (default `http://localhost:3002`, where this
process asks whether its own Cell is quarantined before a risky write; see FR-22 below).

On every non-production boot it seeds one demo customer, `alice`, aligned with lane A's
`scripts/seed.ts` data (`customer:alice` / `cust-alice`, Cell 1), plus a matching FR-01 registry entry,
and prints a fresh valid TOTP code to the console (the password itself is never printed; see below).
This is a demo convenience, guarded by `NODE_ENV !== 'production'` and labelled loudly, same honesty
principle as `reVerificationResult.livenessSimulated`.

**Demo credentials:** username `alice`, password `demo-password-123`. Re-verify (FR-01) with customerId
`cust-alice`, registryDocumentId `DOC-ALICE-001`.

## Endpoints

| Method | Path | Notes |
|---|---|---|
| POST | `/v1/identity/re-verify` | FR-01. `livenessSimulated` is always `true` |
| POST | `/v1/auth/login` | FR-03. Never returns a session, only an MFA challenge |
| POST | `/v1/auth/mfa/verify` | Redeems the challenge with a TOTP code, issues a session |
| POST | `/v1/auth/refresh` | Rotates a refresh token. Reuse revokes the whole session family |
| GET | `/v1/me/dashboard` | Bearer-guarded. Reads a real balance through `@arka/accounts` |
| POST | `/v1/identity/kyc-upload` | FR-02, multipart, field name `file` |
| POST | `/v1/identity/account-opening` | FR-02, provisions a real account via `AccountsService.open` |
| POST | `/v1/identity/step-up/challenge` | FR-04, bearer-guarded. Issues a challenge for a reason (`new_payee`, `over_limit`, `unrecognised_device`) |
| POST | `/v1/identity/step-up/verify` | FR-04, redeems the challenge with a TOTP code, returns a single-use `stepUpToken` |
| POST | `/v1/payments/transfers` | FR-09, FR-04, screen W3. Bearer-guarded, `Idempotency-Key` required. A new payee returns `{ stepUpRequired: true }` instead of transferring; retry with `X-Step-Up-Token` once step-up completes. On success, notifies both sides (FR-19) and, for a step-up-gated transfer, raises a security alert (FR-20) |
| GET | `/v1/accounts/:accountId/history` | FR-06, FR-08, screen W2. Bearer-guarded, rejects an account the session does not own. `?limit=` (FR-15, set on screen W4) caps the response to the newest few lines, a `400` on anything not a positive integer |
| GET | `/v1/payments/limits/:accountId` | FR-12. Bearer-guarded, ownership-checked. No step-up needed to read |
| POST | `/v1/payments/limits/:accountId` | FR-12, FR-20. Requires `X-Step-Up-Token` (reason `over_limit`) or `428`. Raises a security alert on success |
| GET | `/v1/notifications` | FR-19, FR-20. Bearer-guarded. The calling session's own inbox, newest first |
| POST | `/v1/notifications/:notificationId/read` | Bearer-guarded, rejects a notification belonging to a different customer |
| POST | `/v1/payments/agent-cash/request` | FR-16. Unauthenticated, same precedent as QR generation: no agent identity system exists in this scope. Writes the OTP into the customer's own inbox, never returns it in the response |
| POST | `/v1/payments/agent-cash/complete` | FR-16. `Idempotency-Key` required. Authorised by the OTP itself, not a session |
| POST | `/v1/payments/qr/generate` | FR-11. Unauthenticated: no merchant identity system exists in this scope, the same reason agent-cash's `request` has none |
| POST | `/v1/payments/qr/redeem` | FR-11. Bearer-guarded, ownership-checked on `customerAccountId`, `Idempotency-Key` required. This one moves a real customer's money, unlike `generate`, so it is guarded exactly like `/v1/payments/transfers` |

`AgentCashController` is unauthenticated on purpose (`src/payments/agent-cash.controller.ts`): there is
no agent login system built in this scope, the same reason merchant QR generation has none either.
Authorisation is the OTP, delivered out of band to the customer's own notification inbox and never
returned to the agent directly.

`TransfersController` (`src/payments/transfers.controller.ts`) verifies step-up with one in-process call
to `IdentityService.verifyStepUpToken`, not a network hop; see docs/adr/0006 for why that is fine at
Phase 2 scale. Both payments controllers share an ownership check
(`src/payments/account-ownership.ts`): a customer can only transfer from, or read the history of, an
account `AccountsService.summariesForCustomer` actually returns for their session, checked before any
request reaches `@arka/payments` or `@arka/accounts`.

## FR-22: a real quarantine gap, found live and closed

Found by Keshan verifying `docs/RUNBOOK.md` P2 literally (see `arka-ops/LOG.md`, 28 July): quarantining
Cell 2 through the Recovery Console correctly made the health map show it read-only, but a real customer
transfer against that same Cell's `apps/identity` still succeeded. `TransfersController`,
`AgentCashController.complete`, `QrController.redeem` and `LimitsController.change` never checked
quarantine state at all; the only place it was enforced was `apps/gateway`'s separate `write-check`
endpoint, which nothing in the real customer journey ever calls (`apps/web` talks to `apps/identity`
directly, per ADR 0006).

Closed with `QuarantineGuard` (`src/recovery/quarantine.guard.ts`), applied to exactly those four write
endpoints, not to reads: a quarantined Cell is read-only, not down, so `GET /v1/me/dashboard` and history
must keep working. The guard asks `apps/recovery` directly via `HttpQuarantineChecker`
(`src/recovery/quarantine-checker.ts`), keyed by this process's own `CELL_ID`, deliberately not routed
through the gateway's customer-keyed `write-check` endpoint: that re-derives a Cell from a customer id
via the Cell Router's hash, which can disagree with the Cell this process actually is (the Cell Router
has its own known reshuffle caveat, see `arka-ops/LOG.md`). Fails closed: if the check itself cannot be
completed, the request is rejected `503 QUARANTINE_CHECK_UNAVAILABLE`, not silently allowed through.

Not authenticated between the two processes yet, a known gap rather than a silent one:
`apps/recovery`'s `GET /v1/recovery/quarantine/:cellId` is also called unauthenticated directly from the
browser by `apps/console` (W5's health map), so it cannot be gated behind `@arka/workload-auth` without
breaking that screen. Same accepted gap `apps/gateway`'s own `write-check` endpoint already has.

`test/http.integration.test.ts` reproduces the exact live finding: a transfer against a quarantined Cell
is rejected `403 CELL_QUARANTINED`, a read against the same Cell still succeeds, and a transfer once the
Cell is no longer quarantined succeeds again.

## Tests

`test/http.integration.test.ts` boots the actual compiled app and calls it over real HTTP, same pattern
as `apps/gateway`. It overrides `IdentityService`, `AccountsService`, `PaymentsService` and
`NotificationsService` with in-memory-backed instances rather than hitting Postgres: storage correctness
is already proven exhaustively by each service's own `pg-stores.integration.test.ts`, and running every
package's Postgres-touching tests concurrently under `turbo run test` would race to reset the same
schemas. This file's job is the HTTP boundary: request validation, the guard, ownership checks, and the
full journeys wired together for real, over the network, not asserted against pieces in isolation. 26
tests: re-verify to dashboard (screen W1), the transfer-to-a-new-payee-triggers-step-up-then-succeeds
round trip (screens W2 and W3), a familiar-payee transfer notifying both sender and receiver (FR-19), the
notification inbox and its ownership check, the daily-limit-change flow requiring step-up and raising a
security alert (FR-12, FR-20), agent cash-in with the OTP read from the customer's own notification
inbox exactly as a real customer would (FR-16), including a wrong-OTP rejection followed by a successful
retry with the right one, `?limit=` (FR-15) capping history to the newest lines while rejecting
anything not a positive integer, and a merchant generating a QR code with no login followed by a real
customer redemption that moves the balance (FR-11), including redeeming the same code twice with two
different idempotency keys correctly rejecting the second, and FR-22: a transfer rejected while this
Cell is quarantined with a read still succeeding, and transfers working again once it is not.

The login rate limiter is configured generously for this file specifically (the default, 10 per 60s, is
correct in production and proven directly in `services/identity`'s own tests). This suite logs the same
test user in well over ten times across its growing list of journeys, sharing one in-memory rate limiter
for the whole file; without the override, the security control the default exists to enforce would start
rejecting later tests in the same run, for reasons that have nothing to do with what those tests are
actually checking.

Manually verified once more beyond the automated suite: booted the real app against live Postgres,
signed in through the actual browser UI as `alice`, sent a transfer to a brand-new payee, watched the
step-up modal explain why it appeared, completed it with a live TOTP code, and confirmed the dashboard's
balance and history updated correctly afterward.

Verified again for FR-11 (screen W4, `apps/web/src/app/qr/page.tsx`): generated a QR code as
`merchant:kade` with no login, copied the signed token into the redeem form, paid as `alice` from a real
signed-in session, and watched the balance drop by exactly the QR's amount with a real ledger block
number back. Redeeming the identical code again with a different idempotency key correctly failed with
`QR_ALREADY_REDEEMED`, both against the running server directly with curl and through the browser.

Verified again for FR-15 and FR-16 together (screen W4, `apps/web/src/app/agent/page.tsx`): turned on
low-bandwidth mode there, confirmed the dashboard immediately showed only the 10 newest lines with a
visible "low-bandwidth mode is on" hint instead of the seeded account's full 13, then ran a real agent
cash-in against `agent:west` and `customer:alice` (`scripts/seed.ts` now seeds both), reading the OTP
from alice's own notification inbox exactly as a real customer would rather than a shortcut, and watched
the balance update live.
