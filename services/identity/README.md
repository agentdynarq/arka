# @arka/identity

Authentication and identity for one Cell. Owns FR-01 (re-verification against the preserved registry),
FR-02 (account opening with KYC upload), FR-03 (mandatory MFA), FR-04 (step-up authentication),
sessions with refresh token rotation, RBAC, and login rate limiting with lockout. This is the 15%
"authentication system" mark bucket built as a subsystem, not a login form.

Framework-free, same reasoning as `@arka/ledger`, `@arka/accounts` and `@arka/payments`: the behaviour
that decides who is authenticated and what they may do is testable without a server or a database.
`apps/identity` is the thin HTTP adapter.

## Running it

```bash
npm test         # unit tests always run; the Postgres suites skip without a live database
npm run typecheck
```

Bring up `docker compose up` from the repo root first to also exercise the `*.integration.test.ts` files
against a real Cell 1 Postgres.

## Password hashing

Argon2id via `@node-rs/argon2` (`src/password.ts`). A password is hashed on the way in and never
appears again: not in a log line, not in an error message, not in anything a public method returns.
Verification uses the library's own `verify`, never a manual compare, so there is no code path that
could be tempted to compare in variable time. `login` also runs a real Argon2 verify against a decoy
hash when the username does not exist, so an unknown username does not resolve measurably faster than
a known one with a wrong password: that timing difference would otherwise leak which usernames exist.

## TOTP MFA (FR-03)

`src/totp.ts` implements RFC 6238 directly: HMAC-SHA1, 30-second step, 6 digits, one step of drift
tolerance either side, zero runtime dependencies, same rationale as `packages/ledger-core` and
`packages/workload-auth`. A login never completes to a session directly: `login` always returns an
`mfaToken` challenge, and only `verifyMfa` with a correct TOTP code issues real tokens. Code comparison
uses `timingSafeEqual`, not `===`, since these are fixed-width digit strings and a naive compare would
let a timing side channel narrow down the answer.

## Sessions and refresh token rotation

`SessionStore` (`src/session-store.ts`) is deliberately dumb storage: families, refresh tokens, access
tokens, no notion of "rotate" or "reuse detected". That logic lives once, in `IdentityService`, and runs
identically over `InMemorySessionStore` and `PgSessionStore`, the same separation `LedgerService.record`
keeps from `LedgerStore.append`.

Rotation: `refresh(oldToken)` looks up the token by its SHA-256 hash (tokens are never stored raw, same
reasoning as a password hash), marks it used, and issues a new access/refresh pair in the same family.
**A reused refresh token, one already marked used by an earlier rotation, revokes the entire family**,
not just that token: every other token descended from the same login, including the one issued by the
rotation that "should" have been legitimate, stops working. That is the correct response to a stolen
refresh token, where the legitimate holder and the thief are both about to try using it.

Access tokens carry their own expiry independent of refresh rotation: a token stays valid until its own
short TTL even after the refresh token it was issued alongside has been rotated away.

## Step-up authentication (FR-04)

A second proof demanded at the moment of a risky action, never at login. `issueActionChallenge` is
called by whoever decides an action needs it (a new payee, an over-limit amount, an unrecognised
device); `completeStepUp` redeems it with a TOTP code and returns a single-use `stepUpToken` that
`verifyStepUpToken` consumes exactly once, the same one-shot reasoning as an idempotency key in
`@arka/payments`. Not wired to an HTTP endpoint or the web app in this scope (no risky action exists yet
to guard), but built and tested as a real, callable capability rather than left as a contract shape with
nothing behind it.

## RBAC

`assertRole(session, required)` throws `FORBIDDEN_ROLE` on a mismatch. A customer session can never
satisfy an operator-only check and vice versa; there is no role hierarchy or implicit escalation.

## Login rate limiting and lockout

Two independent mechanisms, both real and both tested under a scripted burst:

- `RateLimiter` (`src/rate-limiter.ts`) is a generic fixed-window counter keyed by caller, reused for
  both login attempts (`login:<username>`) and MFA code attempts (`mfa:<mfaToken>`). The Postgres
  implementation is a single `INSERT ... ON CONFLICT DO UPDATE count = count + 1 RETURNING count`, the
  same concurrency-safe shape as `payments.idempotency_keys`.
- Account lockout lives on `CustomerRecord` itself (`failedLoginCount`, `lockedUntil`) and only ever
  engages for a real, existing account after consecutive genuine failures, independent of the rate
  limiter, which engages for any burst regardless of whether the account exists.

## FR-01: re-verification against the preserved registry

`RegistryStore` holds what survived the 2065 collapse in backup: `(customerId, registryDocumentId,
fullName)`. `reVerify` checks a submitted pair against it. `livenessSimulated` is always the literal
`true`, matching `packages/contracts`' `reVerificationResult.livenessSimulated`. There is no branch in
this method that can produce anything else; the honesty about the liveness check being fake is a type
guarantee, not a comment.

## FR-02: account opening with KYC document upload

`uploadKycDocument` stores document bytes and metadata (`KycDocumentStore`), returning a `documentId`.
`openAccount` then requires that id, and Phase 2 has no operator KYC review queue built, so a submission
with a document on file is approved immediately rather than left `pending_review` forever; the status
column stays meaningful for when review exists. On approval, `openAccount` provisions a real account
through `AccountsService.open(accountId, customerId, displayName)`, the integration point with
`@arka/accounts`: a newly opened account is visible to Accounts immediately, not just recorded here with
nothing on the other side. This mirrors the gap Hasitha found and fixed in `scripts/seed.ts` for
already-seeded data, avoided here from the start.

## What is deliberately in memory, not Postgres

MFA challenges, pending step-up challenges and completed step-up proofs live in an in-process `Map` in
`IdentityService`, not behind a store port. They are short-lived (minutes) and Phase 2 runs one Identity
instance per Cell, so this costs a restart losing in-flight challenges in exchange for not adding a
third storage port for state that never needs to outlive a login round trip. Documented here so it reads
as a decision, not an oversight.

## Tests

| Suite | Covers |
|---|---|
| `password.test.ts` | Hashing is salted and one-way, verify accepts/rejects correctly, a malformed hash fails closed |
| `totp.test.ts` | Code generation, verification, drift tolerance, rejection of a foreign secret or malformed input |
| `service.test.ts` | Full login-to-session flow, lockout after repeated failures, rate limiting under a burst, refresh rotation, reuse detection revoking the whole family, RBAC, step-up, FR-01, FR-02 provisioning into a real `AccountsService` |
| `pg-stores.integration.test.ts` | Every store's storage behaviour against a real Postgres, including a genuine concurrent reuse-detection race and a genuine concurrent rate-limiter race, both fired with `Promise.all`, not asserted sequentially. One file, not one per store: every identity store shares the single `identity` schema, and resetting it concurrently from more than one test file racing on the same schema name is a real collision, not a hypothetical one (hit this during development, see the file's own comment) |

`service.test.ts` composes `IdentityService` with every in-memory store and a real `AccountsService`
backed by `InMemoryLedgerStore` and `InMemoryAccountRegistry` from `@arka/ledger` and `@arka/accounts`,
so the FR-02 provisioning test proves the composition, not a mock standing in for it.
