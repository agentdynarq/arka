# Arka user guide

How to run Arka and walk through it as each kind of user.

## 1. Running it

Requires Docker with Compose v2, and Node **22 or later** with pnpm 11 or later. Node 20 fails at
install: the root `package.json` sets `engines.node` to `>=22`. `corepack enable` is the easiest way
to get the right pnpm.

This path was verified end to end on a fresh clone. Follow it in order.

```bash
git clone <repo-url> arka && cd arka
pnpm install
cp .env.example .env
docker compose up -d --wait
pnpm seed
pnpm dev
```

`docker compose up` starts two complete, independent Cells. `--wait` holds until every container
passes its healthcheck; without it, Compose returns as soon as the containers start and `pnpm seed`
can reach Postgres before it accepts connections. `pnpm seed` loads deterministic demo data so that
everything below matches what you will actually see, and prints:

```
cell-1: seeded 15 blocks (customer:alice, customer:bob, agent:west, merchant:kade)
cell-2: seeded 14 blocks (customer:chandi, customer:deepal)
```

Running it again is safe. It reports `already seeded` and changes nothing. Use `pnpm seed --reset` to
rebuild both Cells from scratch.

**Give it about 20 seconds after boot before attempting the first transfer.** Payments check with the
Recovery service whether their Cell is quarantined before any write, and until that service is
listening the answer is `503 QUARANTINE_CHECK_UNAVAILABLE`. Retry after a moment and it succeeds.
Reads work throughout.

| Surface | URL | Who it is for |
|---|---|---|
| Customer app | http://localhost:3000 | Customers, merchants, agents |
| Recovery Console | http://localhost:3300 | Bank operators |
| API gateway | http://localhost:8080 | The Cell Router; the write-check enforcement point quarantine relies on (`docs/RUNBOOK.md` P2). No OpenAPI docs endpoint yet, that is deferred (section 6) |

The customer app and Recovery Console each call their own Cell's backend API directly rather than
through the gateway (`apps/identity` on `:3001`, `apps/recovery` on `:3002`), matching
`docs/adr/0006`. Worth knowing if you are curling the API directly rather than clicking through the
UI.

## 2. Demo accounts

Every account below is seeded. Passwords are demo values and the data is fictional.

| Persona | Login | Password | MFA code | Cell |
|---|---|---|---|---|
| Returning customer | `alice` | `demo-password-123` | press "Check your phone for the code" at the MFA step | cell-1 |
| Second customer, different Cell | `chandi` | `demo-password-123` | press "Check your phone for the code" at the MFA step | cell-2 |

**Getting the MFA code.** At the MFA step, press **"Check your phone for the code"** and the current
code appears on screen. It rotates every 30 seconds and the panel shows the countdown, so take the
code as you enter it rather than reading it early.

That button calls `GET /v1/auth/demo/mfa-code`, which only exists when `DEMO_MFA_ENDPOINT_ENABLED=true`.
`.env.example` sets it, so a clean clone has it on. If you built your `.env` by hand and the button
returns a 404, that variable is why. It is judge convenience for a local demo and is never set in
production, where the code reaches the customer's own device and never a screen.

The same code is also printed to the identity server's console at boot, next to the re-verification
values. That line is easy to miss once `pnpm dev` interleaves five apps' output, and it is stale
within 30 seconds, so prefer the button.

Alice's re-verification values, needed on the first screen before the password step: customer ID
`cust-alice`, registry document `DOC-ALICE-001`. They are printed at boot too.
| Merchant | No login: authorisation is the signed QR token itself (3.5) | | | cell-1 |
| Authorised agent | No login: authorisation is the customer's OTP (3.6) | | | cell-1 |
| Operator one | No login: `operatorId` is typed directly into the console (4.2) | | | control plane |
| Operator two, for dual approval | No login: a second, distinct `operatorId` typed directly into the console (4.2) | | | control plane |

Two operator accounts exist because quarantine requires dual approval and cannot be completed by one
person. That is deliberate, not a gap in the demo data.

Merchant and agent have no identity system in this scope by design, not an oversight: FR-11's QR
acceptance and FR-16's agent cash-in/cash-out are both unauthenticated at that role, because the
security property they rely on is the OTP or the signed token, not a login. The Recovery Console has
no operator login either, `operatorId` is free text (see `apps/console/src/app/health-map/page.tsx`'s
own comment); RBAC and session auth already exist as real capabilities in `@arka/identity` and wiring
them into the console is future work, not pretended here.

The second customer's login is Cell 2's own seeded account, `chandi`, not `alice` again: each Cell
seeds different customers (`scripts/seed.ts`'s `CUSTOMERS_BY_CELL`, cell-1 gets alice/bob, cell-2 gets
chandi/deepal), and `apps/identity`'s demo bootstrap is Cell-aware for the same reason, so that a
second identity server pointed at Cell 2 seeds a login that actually has a matching account there
rather than an empty dashboard.

## 3. Customer journeys

### 3.1 Regaining access (W1)

The front door of the recovery. A returning customer proves who they are against the preserved
customer registry.

1. Open the customer app and choose to re-verify.
2. Enter the NIC and registered contact number.
3. Complete the liveness step. **This step is simulated.** Real biometric liveness is not implemented;
   the interface demonstrates where it sits in the flow and the check always passes in the demo.
4. Complete multi-factor authentication.
5. You arrive at the dashboard.

### 3.2 Seeing your money (W2)

Balances are restored from the verified ledger rather than from a cached figure. Beside the balance
you will see the ledger verification status and the health of the Cell serving you. Both are shown in
the interface rather than buried in settings, because a bank reopening after a compromise has to prove
rather than promise.

Each transaction in the history shows its ledger confirmation status.

### 3.3 Moving money (W3)

1. Start a transfer and choose or add a payee.
2. Enter an amount.
3. If the payee is new, the amount is over your limit, or the device is unrecognised, **step-up
   authentication** appears and explains why it appeared.
4. Confirm. The transfer completes and appears in history with its ledger status.

The web UI does not have a "simulate a retry" button; every submission generates a fresh idempotency
key, by design, since a customer clicking Send twice on purpose is a new request, not a retry. The
idempotency guarantee (FR-13) is proven directly: `services/payments/test/service.test.ts`'s "the same
key fired concurrently transfers money exactly once" fires two identical `transfer()` calls with
`Promise.all` against a real backing store and asserts exactly one execution lands. Run `pnpm test` to
see it pass. Against a live server, firing the same `Idempotency-Key` twice at once moves the money
once, not twice, and both responses return the identical `transferId`.

### 3.4 Daily limits

Limits are viewable and changeable in settings. Changing a limit is itself a high-risk action and
requires step-up authentication.

### 3.5 Merchant QR acceptance (W4)

1. On the "Generate a QR code" screen, the merchant enters their own account, an amount, and a
   reference, then generates. There is no merchant login in this scope: any real account id can
   generate a code, the same simplification agent cash-in makes for agents.
2. This build shows the signed code as text rather than a scannable barcode image, labelled as such: a
   real device would render this as a QR code, but generating and reading barcode images is outside
   this build's scope and would only have simulated the interesting part.
3. The customer copies the code into "Redeem a QR code" from their own signed-in account and confirms.
   The transfer completes immediately and appears in their history with its ledger status, exactly like
   any other transfer.
4. The same code cannot be redeemed a second time, even with a different attempt id, and even if two
   redemptions are fired at the same moment.

### 3.6 Agent cash-in and cash-out (W4)

The inclusion surface, for customers who cannot reach digital banking directly. An authorised agent
performs the transaction and the customer consents by OTP, so the agent never acts alone on a
customer's account.

1. On the "Agent cash / settings" screen, the agent enters their own ID, the agent's cash account, the
   customer's account, a direction (cash in: the customer hands the agent physical cash; cash out: the
   agent hands the customer physical cash), and an amount, then requests it.
2. Nothing about the customer's money moves yet. A one-time code is sent straight to the customer's own
   notification inbox, never shown to the agent or returned by the request.
3. The customer reads the code out to the agent only if they agree to the transaction. The agent enters
   it to confirm.
4. The transfer completes immediately and appears in the customer's history with its ledger status.
   The same code cannot be used a second time, even by a genuinely concurrent second attempt.

There is no agent login in this scope: authorisation is the OTP itself, the same reason merchant QR
acceptance (3.5) has no merchant login either.

### 3.7 Low-bandwidth mode

A toggle on the same "Agent cash / settings" screen, off by default. Turning it on is remembered on that
device and takes effect immediately: the dashboard's transaction history asks for only the 10 most
recent transactions instead of the full ledger, a real reduction in what is downloaded, not only a
visual change, and the dashboard says so plainly above the history list. Turning it off restores the
full history on the next load.

## 4. Operator journeys

### 4.1 Cell health map (W5)

The Recovery Console opens on a live health map of every Cell, with the operator audit trail (FR-25)
alongside it. This screen is containment made clickable.

### 4.2 Quarantining a Cell (W5)

This is the demonstration that matters most, because it is the claim the whole architecture rests on.

1. On the health map, type an operator id (for example `operator-1`) into "Acting as operator id".
   Select the Cell and request quarantine, stating a reason. There is no operator login in this scope,
   the id is free text (see section 2).
2. In a separate browser session, type a second, distinct operator id (for example `operator-2`) and
   approve. The action does not take effect on one operator's authority, and the same id cannot approve
   its own request.
3. Observe on the health map that the Cell is quarantined.

To see containment for yourself, keep a second browser signed in as the customer in cell-2 while you
quarantine cell-1. That customer keeps transacting normally throughout. Meanwhile the cell-1 customer
can still read balances and history but cannot move money, which is graceful degradation rather than
an outage.

### 4.3 Ledger integrity audit (W6)

1. Choose a Cell and a block range.
2. Run verification. The hash chain is walked and each hash recomputed.
3. Export the evidence.

A clean result reports the record count and the root hash. A tampered chain reports the exact
sequence number of the first break, not merely that something is wrong.

To prove the detection is real rather than decorative, the test suite deliberately alters a historical
record and asserts that verification catches it at the right index. Run it with `pnpm test`.

## 5. Command line

```bash
pnpm verify-ledger --cell cell-1   # walk the chain, print records, breaks, root hash
pnpm test                          # full test suite
pnpm seed --reset                  # rebuild demo data from scratch
```

## 6. What is not built

Named rather than omitted, so nothing here is a surprise:

- Anomaly detection beyond rate limiting
- Multi-language interface (Sinhala and Tamil)
- Recurring payments
- Transfers to other banks
- Signed offline vouchers
- Downloadable statements
- Session and device revocation
- Cloud deployment
- OpenAPI documentation at the gateway
- Per-Cell ledger signing keys and the 3-of-5 quorum root recovery ceremony (`docs/adr/0003`'s design,
  `docs/RUNBOOK.md` P4). The ledger's tamper-evidence today is its hash chain alone, walked and
  recomputed on demand (section 4.3); there is no cryptographic signing key to compromise or rotate yet

The first three were declared deferred in the Phase 1 blueprint. The rest are Should or Could priority
requirements, deferred so that all eighteen Must-priority requirements could be completed properly.
Reasoning is in `PHASE-2-PLAN.md`.

## 7. Troubleshooting

**Ports already in use.** The stack uses `3000` (customer app), `3001` (identity API), `3002`
(recovery API), `3300` (Recovery Console), and `8080` (gateway). If one is already bound, everything
else on it fails to start, sometimes with a misleading error from whichever process asked second. Find
and stop the process holding the port, or override it (every port name in `.env` is a real environment
variable, not a hardcoded value) before retrying.

**`EACCES: permission denied` on a specific port (Windows).** Windows reserves ranges of ports
dynamically for Hyper-V and WSL, and a port your machine reserved today may not be reserved tomorrow.
Check what is currently excluded with:

```bash
netsh interface ipv4 show excludedportrange protocol=tcp
```

If the port an app wants falls inside a listed range, that is the cause, not a code defect. Pick a
different port for that app (its `dev`/`start` script, or its `_PORT` environment variable) rather than
fighting the exclusion.

**A backend app (`gateway`, `identity`, `recovery`) briefly `EADDRINUSE`s right after a file save under
`pnpm dev`.** These three run as `tsc` build followed by `node --watch dist/main.js`, so a save
triggers a rebuild and a restart. On Windows the old process does not always release its socket before
the new one tries to bind it, and the watcher retries on the next change. Save the file again, or
restart `pnpm dev`, and it clears.

**`docker compose up` reports a container unhealthy on the very first run.** Postgres's first-run
initialisation (creating the data directory, running init scripts) has, on at least one machine this
team develops on, taken longer than the healthcheck's retry budget before settling on its own. This is
not a compose defect: check `docker compose ps` a little longer, or rerun `docker compose up -d`, before
assuming something is actually broken.

**`pnpm seed` prints "already seeded" and does nothing.** That is the intended idempotent behaviour, not
a failure, it means both Cells already have deterministic demo data from a previous run. Use
`pnpm seed --reset` to drop and rebuild every Cell's schema from scratch.

**`pnpm seed` or any app can't reach Postgres at all.** `docker compose up -d` has to be running and
healthy first (`docker compose ps`), and `.env` has to exist (`cp .env.example .env`, once, before the
first run). Every service falls back to Cell 1's local compose connection string when `DATABASE_URL` is
unset, which is convenient for a first run but can hide a genuinely missing `.env` on a second one.

**Running a NestJS app (`gateway`, `identity`, `recovery`) directly instead of through `pnpm dev`.**
`node --experimental-strip-types src/main.ts` fails with a `SyntaxError` on the first decorator
(`@Module`, `@Controller`, ...): Node's type-stripping does not implement decorators. Build first
(`pnpm build`), then run the compiled output (`pnpm start`), the same two steps `pnpm dev` already runs
for you.
