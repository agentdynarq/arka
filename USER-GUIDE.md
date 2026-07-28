# Arka user guide

How to run Arka and walk through it as each kind of user.

> **Draft.** Sections marked `[FILL]` are completed as features land and are verified before
> submission. This notice and every `[FILL]` marker must be gone before the repository is submitted.
> Checklist in `../arka-ops/SUBMISSION.md`.

## 1. Running it

Requires Docker and Node 20 or later with pnpm installed.

```bash
git clone <repo-url> arka && cd arka
pnpm install
cp .env.example .env
docker compose up -d
pnpm seed
pnpm dev
```

`docker compose up` starts two complete, independent Cells. `pnpm seed` loads deterministic demo data
so that everything below matches what you will actually see.

| Surface | URL | Who it is for |
|---|---|---|
| Customer app | http://localhost:3000 | Customers, merchants, agents |
| Recovery Console | http://localhost:3001 | Bank operators |
| API gateway | http://localhost:8080 | Direct API access, OpenAPI at `/docs` |

## 2. Demo accounts

Every account below is seeded. Passwords are demo values and the data is fictional.

| Persona | Login | Password | MFA code | Cell |
|---|---|---|---|---|
| Returning customer | `[FILL]` | `[FILL]` | `[FILL]` | cell-1 |
| Second customer, different Cell | `[FILL]` | `[FILL]` | `[FILL]` | cell-2 |
| Merchant | `[FILL]` | `[FILL]` | `[FILL]` | cell-1 |
| Authorised agent | `[FILL]` | `[FILL]` | `[FILL]` | cell-1 |
| Operator one | `[FILL]` | `[FILL]` | `[FILL]` | control plane |
| Operator two, for dual approval | `[FILL]` | `[FILL]` | `[FILL]` | control plane |

Two operator accounts exist because quarantine requires dual approval and cannot be completed by one
person. That is deliberate, not a gap in the demo data.

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

To see idempotency working, retry an interrupted transfer. The money moves exactly once. `[FILL:
exact steps to demonstrate this in the UI]`

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

The Recovery Console opens on a live health map of every Cell, with the anomaly feed alongside it.
This screen is containment made clickable.

### 4.2 Quarantining a Cell (W5)

This is the demonstration that matters most, because it is the claim the whole architecture rests on.

1. Sign in as operator one. Select the Cell and request quarantine, stating a reason.
2. Sign in as operator two in a separate session and approve. The action does not take effect on one
   operator's authority.
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

The first three were declared deferred in the Phase 1 blueprint. The rest are Should or Could priority
requirements, deferred so that all eighteen Must-priority requirements could be completed properly.
Reasoning is in `PHASE-2-PLAN.md`.

## 7. Troubleshooting

`[FILL: common issues, ports in use, compose not starting, seed failing]`
