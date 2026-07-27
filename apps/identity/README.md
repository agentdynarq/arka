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

Reads `DATABASE_URL` (falls back to Cell 1's local compose port), `CELL_ID` (default `cell-1`), and
`IDENTITY_PORT` (default `3001`).

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
| POST | `/v1/payments/transfers` | FR-09, FR-04, screen W3. Bearer-guarded, `Idempotency-Key` required. A new payee returns `{ stepUpRequired: true }` instead of transferring; retry with `X-Step-Up-Token` once step-up completes |
| GET | `/v1/accounts/:accountId/history` | FR-06, FR-08, screen W2. Bearer-guarded, rejects an account the session does not own |

`TransfersController` (`src/payments/transfers.controller.ts`) verifies step-up with one in-process call
to `IdentityService.verifyStepUpToken`, not a network hop; see docs/adr/0006 for why that is fine at
Phase 2 scale. Both payments controllers share an ownership check
(`src/payments/account-ownership.ts`): a customer can only transfer from, or read the history of, an
account `AccountsService.summariesForCustomer` actually returns for their session, checked before any
request reaches `@arka/payments` or `@arka/accounts`.

## Tests

`test/http.integration.test.ts` boots the actual compiled app and calls it over real HTTP, same pattern
as `apps/gateway`. It overrides `IdentityService`, `AccountsService` and `PaymentsService` with
in-memory-backed instances rather than hitting Postgres: storage correctness is already proven
exhaustively by each service's own `pg-stores.integration.test.ts`, and running every package's
Postgres-touching tests concurrently under `turbo run test` would race to reset the same schemas. This
file's job is the HTTP boundary: request validation, the guard, ownership checks, and the full journeys
wired together for real, over the network, not asserted against pieces in isolation. Covers re-verify to
dashboard (screen W1), and the transfer-to-a-new-payee-triggers-step-up-then-succeeds round trip
(screens W2 and W3) end to end, including a wrong-account ownership rejection on both the transfer and
history endpoints.

Manually verified once more beyond the automated suite: booted the real app against live Postgres,
signed in through the actual browser UI as `alice`, sent a transfer to a brand-new payee, watched the
step-up modal explain why it appeared, completed it with a live TOTP code, and confirmed the dashboard's
balance and history updated correctly afterward.
