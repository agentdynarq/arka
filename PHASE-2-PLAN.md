# Arka — Phase 2 (Rebuild) plan

Re-cut on 26 July 2026 against the released Phase 2 brief. Supersedes the pre-brief plan.

**Deadline: 31 July 2026, 23:59.** Phase 2 opened on 25 July, so roughly five working days remain.
Team of two, both working with Claude Code, split into lanes (see `CLAUDE.md`).

## What the brief actually asks for

Three deliverables, submitted at duothan.ieeensbm.org/submission:

1. Public GitHub repository link
2. Working web application source code, as a zip
3. `USER-GUIDE.md`

No deployment link is required and no cloud environment is verified in this phase. That is Phase 3.

## How the mark allocation changes the plan

| Criterion | Weight | Where it is earned |
|---|---|---|
| Server-side handling | 20% | `ledger-core`, idempotency, outbox, sagas, validation, transactions, structured errors |
| System architecture and best practices | 15% | Cell model, monorepo boundaries, database-per-service, ADRs |
| Authentication system | 15% | Identity service in depth: MFA, step-up, sessions, RBAC, lockout |
| Solution's functionality | 15% | The eighteen Must FRs from Phase 1 |
| Quality assurance strategies | 15% | Test pyramid, CI gates, `docs/TEST-STRATEGY.md`, security scanning |
| Client-side handling | 10% | Six screens, following the Phase 1 wireframes |
| Enterprise base strategies | 10% | RUNBOOK, ADRs, observability, config management, docs |

Three decisions follow directly from that table.

**Terraform is cut from Phase 2.** It earns close to nothing here and belongs to the Phase 3 window
of 1 to 5 August. A skeleton stays for the architecture narrative, nothing more.

**Authentication is promoted.** It is a 15% bucket on its own and gets a full day rather than being a
feature inside identity work.

**The frontend is capped.** Ten percent does not justify more than following the wireframes we already
produced in Phase 1. No visual redesign, no component library building.

## Scope: the eighteen Musts, and nothing else

Phase 1 committed to eighteen Must-priority requirements and declared all of them in scope for Phase 2.
They remain reachable. Everything below Must is cut and documented as deferred, which is a stronger
story than twenty-two half-built features.

| In scope (Must) | |
|---|---|
| FR-01 | Re-verify identity against the preserved registry |
| FR-02 | New account online with KYC document upload |
| FR-03 | MFA on login |
| FR-04 | Step-up authentication on high-risk actions |
| FR-06 | Real-time balances and transaction history |
| FR-08 | Ledger confirmation status per transaction |
| FR-09 | Instant transfer between Arka accounts |
| FR-11 | Merchant QR acceptance |
| FR-12 | View and change daily limits, gated by step-up |
| FR-13 | Idempotency: a retried payment never executes twice |
| FR-15 | Low-bandwidth mode |
| FR-16 | Agent cash-in and cash-out with OTP consent |
| FR-19 | Real-time transaction alerts |
| FR-20 | Security alerts |
| FR-21 | Live Cell health on the Recovery Console |
| FR-22 | Quarantine a Cell with dual approval |
| FR-23 | On-demand ledger integrity verification with export |
| FR-25 | Append-only operator audit trail |

Deferred and documented as such: FR-05, FR-07, FR-10, FR-17, FR-18, FR-24 (Should) and FR-14 (Could).
FR-05 session revocation is cheap and sits in the auth bucket, so pick it up if lane B finishes early.

One honesty note. FR-01 specifies a liveness check. We cannot build real liveness in five days. It is
simulated, and `USER-GUIDE.md` says so plainly.

## Schedule

Two lanes running in parallel. Lane A is the money spine (Hasitha), lane B is the edge and ops
(Keshan). Full ownership map in `CLAUDE.md`.

| Day | Lane A | Lane B | Merged state at end of day |
|---|---|---|---|
| **26 Jul, tonight** | Start `ledger-core`. Pure TypeScript, zero dependencies, so it needs nothing that does not exist yet | Repo public. pnpm workspace, Turborepo, `docker-compose.yml` bringing up two Cells' Postgres and Redis, CI green | Repo exists, compose boots, `ledger-core` has a failing test suite to fill |
| **27 Jul** | `ledger-core` complete with its full test suite. Ledger service wrapping it | `packages/contracts` written and frozen by midday. Gateway with Cell Router | A request lands in a named Cell and says which one it hit. `verify-ledger.ts` prints a clean chain |
| **28 Jul** | Accounts reading balances from the ledger. Payments started: transfer plus idempotency | Authentication in full depth: Argon2, sessions with refresh rotation, TOTP MFA, step-up, RBAC, login rate limiting, lockout. W1 wired | A seeded customer re-verifies, passes MFA, and reaches a real dashboard |
| **29 Jul** | Payments complete: QR acceptance, daily limits, saga with compensation. W2 and W3 | Recovery Console: W5 health map, quarantine with dual approval. Audit trail wired | The same transfer fired twice moves money exactly once. Quarantining Cell 1 leaves Cell 2 serving |
| **30 Jul** | Notifications (FR-19, FR-20). Agent cash-in and cash-out (FR-16). Low-bandwidth mode (FR-15) | W6 integrity audit with export. `docs/TEST-STRATEGY.md`. End-to-end tests on the two critical journeys. CI hardening | All eighteen Musts demonstrable |
| **31 Jul** | Feature freeze at midday. Both: `USER-GUIDE.md`, README, `docs/ARCHITECTURE.md`, `docs/RUNBOOK.md`. Rehearse both journeys twice. Zip and submit | | Submitted by 18:00, not 23:00 |

## Coordination

- Two check-ins a day, five minutes. Morning: which lane am I in, what do I need from you. Night:
  merge to main, both pull, confirm compose still boots.
- `packages/contracts` is frozen after 27 July midday. Changing it after that requires telling the
  other person first.
- Team state lives in `../arka-ops/`: `TASKS.md` for the live board, `LOG.md` for end-of-day notes.

## Risks, ranked

1. **A judge cannot run it.** The single largest risk. Roughly nineteen containers have to come up on
   one command. Mitigation: compose exists on night one and is verified every evening, before any
   feature work.
2. **The foundation slips past 28 July.** Ledger, gateway and auth gate everything downstream. If any
   of the three is not done by end of 28 July, cut FR-16 and FR-15 immediately rather than late.
3. **Contracts churn.** Two lanes working against a moving contract loses hours. Freeze it early.
4. **A thin commit history.** We started on day two of seven. Mitigation: small commits, pushed
   continuously, from tonight. Nothing is backdated.
5. **Documentation left to the last day.** Worth 25% across QA and enterprise strategies. Mitigation:
   ADRs are written when the decision is made, not reconstructed on 31 July.

## Explicitly not in Phase 2

Anomaly detection beyond simple rate limiting, multi-language support, recurring payments, Terraform
and cloud deployment. The first three were already declared deferred in the Phase 1 submission, so
dropping them is consistent rather than a gap. The fourth belongs to Phase 3.
