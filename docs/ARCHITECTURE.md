# Architecture

The Phase 1 blueprint, carried forward and kept in sync with what was actually built. Where the
implementation diverges from the submitted design, this document records the divergence and why,
rather than quietly restating the plan.

## 1. Layers

**Edge and access.** An API Gateway terminates TLS, authenticates users, applies MFA and step-up
policies, and pins every customer to exactly one Cell through the Cell Router. Nothing behind the
gateway is reachable directly.

**Cells, the data plane.** Each Cell is a full, independent deployment: Identity, Accounts, Payments,
Ledger and Notifications, plus the Cell's own event bus. Database-per-service is enforced by schema
separation and per-service credentials, so no service can read another service's tables. A
compromised service leaks only its own data.

**Control plane, a separate trust zone.** The Recovery Console, the operator audit trail and
observability. It observes and rebuilds Cells through a one-way channel. The data plane has no path
back into it, and it holds no customer data.

## 2. How components communicate

| Path | Mechanism | Security property |
|---|---|---|
| User to platform | HTTPS/JSON to the gateway only | TLS, MFA at login, step-up on risk |
| Service to service, synchronous | Short-lived workload identities | No implicit trust by network location |
| Service to service, state changes | Domain events on the Cell's bus, outbox on write, idempotent consumers | At-least-once delivery without double execution |
| Multi-step money movement | Saga orchestration in Payments with compensating actions | No distributed transaction leaves money in limbo |
| Cell to Cell | None. No route exists | Lateral movement is structurally impossible |
| Control plane to Cells | One-way observe and rebuild | Customer data never leaves its Cell |

## 3. A Cell is configuration, not code

There is exactly one copy of each service in this repository. A Cell is that service deployed with a
different environment: `CELL_ID`, `DATABASE_URL`, `REDIS_URL`, `LEDGER_SIGNING_KEY`.

No service contains a conditional that branches on which Cell it is running as. This is the property
that makes the isolation claim reviewable in ten seconds: put the two environment files side by side
and observe that Cell 1 holds no credential that reaches Cell 2. Adding a third Cell is a config
file, not a code change.

## 4. Replaying the disaster

Assume the malware lands on the Payments service of one Cell.

1. It tries to move laterally. Neighbouring services demand a valid workload identity. The infected
   process cannot mint one. Other Cells are not reachable at all, because no route exists.
2. It tries to corrupt records. The ledger is append-only and hash-chained. Any rewrite breaks the
   chain and is reported by the next integrity verification, with the index of the break.
3. Rate limiting throttles the anomalous source and the alert reaches operations.
4. The operator opens the Recovery Console, sees the Cell degraded on the health map, and quarantines
   it under dual approval. That Cell's customers drop to read-only. Every other Cell keeps serving.
5. The Cell is rebuilt and its state replayed from the ledger. Zero ledger records lost.

The full operator procedure is in [RUNBOOK.md](RUNBOOK.md).

## 5. Traceability

Every capability maps to requirements, owning services and screens. This is the blueprint's proof of
coherence and the reviewer's shortest path into the codebase.

| Capability | Requirements | Services | Screens |
|---|---|---|---|
| Regain access | FR-01 to FR-04 | Identity, Gateway | W1 |
| See and trust your money | FR-06, FR-08 | Accounts, Ledger | W2 |
| Move money safely | FR-09, FR-11, FR-12, FR-13 | Payments, Ledger | W2, W3 |
| Reach everyone | FR-15, FR-16 | Payments, Web app | W4 |
| Stay informed | FR-19, FR-20 | Notifications | W2 |
| Contain and recover | FR-21, FR-22, FR-23, FR-25 | Recovery Console, Ledger, Control plane | W5, W6 |

Deferred with intent, not omitted: FR-05, FR-07, FR-10, FR-14, FR-17, FR-18, FR-24. Rationale in
[../PHASE-2-PLAN.md](../PHASE-2-PLAN.md).

## 6. Quality targets and how each is proven

A quality target nobody tests is a wish. Each group has a method of proof.

| Group | Target | Proof |
|---|---|---|
| Containment | One incident affects at most one Cell | Quarantine one Cell and observe the others still serving |
| Graceful degradation | Balances and history stay readable when payments are impaired | Read-only mode exercised in the quarantine test |
| Recovery | Ledger records lost on rebuild: zero | Replay a Cell's ledger and compare projections |
| Integrity | Tampering is detectable | Alter a historical record in a test and show verification catching it, at the right index |
| Security | No static secrets, dependencies scanned | CI gates on every commit |
| Money correctness | No double execution, no float error | Idempotency test fires the same request twice, `ledger-core` uses `bigint` minor units throughout |

## 7. Scaling

Arka scales by adding Cells rather than by growing one system. Each new Cell adds capacity for a
fixed shard of customers and simultaneously shrinks the blast radius of any single failure. Load,
risk and cost all scale linearly and predictably.

## 8. Deliberate divergences from the Phase 1 blueprint

Recorded here so a reviewer comparing the two documents finds the reasoning rather than a gap.

| Blueprint said | Built as | Why |
|---|---|---|
| Managed Kafka as design target | Redis Streams, identical semantics | Honest sizing for the competition build. The blueprint already named this substitution |
| AWS managed services, Terraform | Docker Compose, two Cells locally | Phase 2 requires no deployment. Infrastructure as code is Phase 3 work |
| Anomaly detection service per Cell | Rate limiting only | Declared deferred in the Phase 1 submission |
| Liveness check on re-verification | Simulated, and labelled as simulated | Real liveness is not buildable in the phase window, and faking it silently would be dishonest |

## 9. Decision records

One file per irreversible decision, in [adr/](adr/). Written when the decision is made, not
reconstructed afterwards.
