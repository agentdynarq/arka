# Architecture decision records

One file per irreversible decision. Written when the decision is made, not reconstructed afterwards.

A decision earns a record here when reversing it later would be expensive: it shapes the data model,
the trust boundaries, or the deployment topology. Reversible choices do not need one.

Format is deliberately short. Context, the decision, the alternative that was genuinely considered,
and the consequences accepted. A record that hides its trade-off cannot be reviewed honestly.

| ADR | Decision | Status |
|---|---|---|
| [0001](0001-cells-with-no-route-between-them.md) | Cells with no network route between them | Accepted |
| [0002](0002-event-sourced-hash-chained-ledger.md) | Event-sourced, hash-chained ledger as the source of truth | Accepted |
| [0003](0003-no-master-key-quorum-recovery.md) | No master key, 3-of-5 quorum recovery | Accepted |
| [0004](0004-redis-streams-for-phase-2.md) | Redis Streams as the event backbone for Phase 2 | Accepted |
| [0005](0005-compose-for-phase-2-terraform-for-phase-3.md) | Docker Compose for Phase 2, Terraform deferred to Phase 3 | Accepted |
| [0006](0006-services-composed-in-one-deployable-per-cell.md) | Identity, Accounts and Payments composed in one deployable for Phase 2 | Accepted |
