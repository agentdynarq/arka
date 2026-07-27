# @arka/identity-app

HTTP adapter for one Cell's identity and authentication. Thin on purpose: everything that decides who is
authenticated and what they may do lives in `@arka/identity`; this app is NestJS controllers, a bearer
token guard, and request validation via `@arka/contracts` zod schemas.

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
| POST | `/v1/identity/step-up/challenge` | FR-04, bearer-guarded. Not wired to a risky action in this scope |
| POST | `/v1/identity/step-up/verify` | FR-04, redeems the challenge with a TOTP code |

## Tests

`test/http.integration.test.ts` boots the actual compiled app and calls it over real HTTP, same pattern
as `apps/gateway`. It overrides `IdentityService` and `AccountsService` with in-memory-backed instances
rather than hitting Postgres: storage correctness is already proven exhaustively by
`services/identity/test/pg-stores.integration.test.ts`, and running both packages' Postgres-touching
tests concurrently under `turbo run test` would race to reset the same `identity` schema. This file's
job is the HTTP boundary: request validation, the guard, and the full re-verify-to-dashboard journey
wired together for real, over the network, not asserted against pieces in isolation.
