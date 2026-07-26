# Arka — agent instructions

This file auto-loads for every Claude Code session in this repository. It is self-contained on purpose:
both team members work from it, on different machines, with no shared setup.

Read this fully before writing code. Glossary in [CONTEXT.md](CONTEXT.md). Schedule and lane split in
[PHASE-2-PLAN.md](PHASE-2-PLAN.md).

## At the start of every session

Read `../arka-ops/TASKS.md` and the last entry in `../arka-ops/LOG.md` before doing anything else.
That is where the other half of the team records what they are building right now. Skipping it is how
two people end up writing the same service twice.

Expected layout on both machines:

```
duothan/
├─ arka/          this repo, public
└─ arka-ops/      private team coordination repo
```

## What Arka is

A cell-isolated digital banking platform, built for Duothan 6.0 (IEEE Student Branch of NSBM). The
2065 scenario in the competition brief is a global malware event that took banking offline. Arka is
the rebuild, designed so that class of total compromise is structurally impossible.

Three doctrines, and every technical decision traces back to one of them:

1. **Assume breach.** Every internal call is authenticated. Network location grants no trust.
2. **Contain by construction.** Customers are sharded across independent Cells that share nothing and
   have no network path to each other. Blast radius is a design parameter, not an outcome.
3. **Recovery is a feature.** An append-only hash-chained ledger makes tampering detectable and state
   rebuildable. No master key exists; root recovery needs a 3-of-5 quorum.

## Phase 2 is what this repo is graded on

Deadline **31 July 2026, 23:59**. Deliverables: this public repo, a source zip, and `USER-GUIDE.md`.

Mark allocation, which should drive where effort goes:

| Criterion | Weight |
|---|---|
| Server-side handling | 20% |
| System architecture and best practices | 15% |
| Authentication system | 15% |
| Solution's functionality | 15% |
| Quality assurance strategies | 15% |
| Client-side handling | 10% |
| Enterprise base strategies | 10% |

Two consequences worth internalising. Half the marks are backend, so do not gold-plate the UI for a
10% bucket. And QA is worth as much as functionality, so tests and `docs/TEST-STRATEGY.md` are not
cleanup work to do at the end.

Judges compare this repo against the Phase 1 blueprint. Staying consistent with the submitted
architecture is worth more than improving on it.

## Hard invariants

Violating any of these is a bug, not a style preference.

- **Money is `bigint` in minor units.** No floating point touches money anywhere, ever. Not in
  calculation, not in transport, not in storage.
- **A Cell is configuration, not code.** There is exactly one copy of each service. A Cell is that
  service deployed with a different `CELL_ID`, database URL, Redis URL and signing key. Never write
  a conditional that branches on which cell it is.
- **The ledger is append-only and hash-chained.** Nothing updates or deletes a ledger row. Same
  primitive is reused for the operator audit trail.
- **Every write that others must learn about goes through the outbox**, written in the same
  transaction as the state change. Consumers dedupe on event id.
- **Payments require an `Idempotency-Key`.** Store key to result. A replay returns the stored result
  and never re-executes.
- **No secrets in the repo.** `.env.example` only. CI fails the build on a secret hit.
- **No cross-cell reads.** Only the gateway knows more than one Cell exists.

## Lane ownership

Work is split vertically so each person owns a slice from database to screen. Stay in your lane. If
you need something changed outside it, ask rather than edit.

| | Hasitha (lane A, the money spine) | Keshan (lane B, the edge and ops) |
|---|---|---|
| Packages | `ledger-core`, `events` | `contracts`, `workload-auth` |
| Services | ledger, accounts, payments, notifications | identity/auth, gateway + cell router |
| Screens | W2 dashboard, W3 transfer | W1 re-verification, W5 health map, W6 integrity audit |
| Also owns | `scripts/seed.ts`, `scripts/verify-ledger.ts` | `docker-compose.yml`, CI, `docs/TEST-STRATEGY.md` |

Shared files with a single owner, to stop the two agents colliding:

- `docker-compose.yml`, root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.github/workflows/` — Keshan only
- `scripts/` — Hasitha only
- `packages/contracts` — either, but tell the other person first. It is the contract that lets both
  lanes work without talking, so silent changes to it break the other person's build.

## Conventions

- **Commit as yourself.** Each team member uses their own git identity. Contribution history is
  graded and a two-person team with one committer reads wrong.
- **No AI attribution.** No `Co-Authored-By: Claude` trailer, no "generated with" text in commits,
  code comments, docs, or the user guide.
- **Branch per piece of work, PR into main.** Self-merge small ones without waiting for review.
  Clean history is part of the mark.
- **Never fabricate.** No invented metrics, no backdated commits, no test that asserts nothing. If
  something is simulated (the FR-01 liveness check, for example), label it as simulated in the user
  guide.
- **Never use em dashes** in any file in this repo. Use periods or commas.
- Conventional-ish commit subjects, lowercase, imperative: `add hash chain verification to ledger-core`.

## Stack

Deliberately boring. The novelty budget is spent on architecture, not the toolchain.

- Frontend: Next.js (React + TypeScript), two apps: `web` (customer) and `console` (operator)
- Services: Node.js + NestJS (TypeScript), one deployable per service, deployed once per Cell
- APIs: REST/JSON, OpenAPI at the gateway, zod validation from `packages/contracts`
- Database: PostgreSQL, one schema per service, ledger as append-only tables with hash chaining
- Events: Redis Streams with outbox pattern and idempotent consumers
- Monorepo: pnpm workspaces + Turborepo
- Local: one `docker compose up` brings up two full Cells. This must never break.

## The rule that outranks the others

A judge who cannot run this scores functionality at zero. If `docker compose up` plus the seed script
stops producing a working two-Cell system, that is a stop-everything bug and it comes before any
feature work.
