# Runbook

Operator procedures for Arka. Written to be followed under pressure, by someone who is not the person
who wrote the code.

This is the highest-value document in the repository for Phase 3, where these procedures are performed
live in front of a judging panel rather than described. Rehearse them until they are boring.

## Conventions

Every procedure states its trigger, its steps, and how you know it worked. Every operator action in
these procedures is recorded in the append-only audit trail automatically. Do not work around the
console to save time; the audit trail is the evidence that the recovery was legitimate.

---

## P1. Verify ledger integrity

**Trigger.** On demand, after any incident, before and after any rebuild, and on a schedule.

**Steps.**

1. Open the Recovery Console, screen W6.
2. Select the Cell and the block range. Default is genesis to head.
3. Run verification. The chain is walked block by block, recomputing each hash.
4. Export the evidence when it completes.

From the command line, which is what to use if the console itself is suspect:

```bash
pnpm verify-ledger --cell cell-1
```

**How you know it worked.** The output states the number of records walked, the root hash, and either
a clean result or the exact sequence number of the first break. A break reports *where*, not just
*that*. If the console and the CLI disagree, trust the CLI and treat the console as compromised.

---

## P2. Quarantine a Cell

**Known gap, not yet fixed (flagged in `../arka-ops/TASKS.md`, 28 July).** Verified live: quarantine
correctly flips the health map and rejects a write through `apps/gateway`'s `write-check` endpoint, but
a real customer transfer fired directly against the quarantined Cell's own `apps/identity` still
succeeds, since `TransfersController` and its siblings never check quarantine state. Do not rehearse
step 4 below ("a write attempt against the quarantined Cell is rejected") against a real transfer
through `apps/web` until this is fixed, it will not behave as written. The gateway `write-check`
endpoint itself does work correctly.

**Trigger.** A Cell shows sustained anomalous behaviour, a confirmed compromise, or a bad deploy that
cannot be rolled back quickly.

Quarantine flips one Cell to read-only. Its customers keep seeing balances and history. They cannot
move money. Every other Cell is untouched and its customers notice nothing.

**Steps.**

1. Open the Recovery Console, screen W5. Confirm the Cell's health status and the anomaly feed.
2. Request quarantine on the affected Cell. State the reason. The reason is recorded.
3. **Dual approval.** A second operator approves from their own session. The action does not take
   effect on one person's authority. This is deliberate and is not to be bypassed.
4. Confirm the health map shows the Cell quarantined and the others green.

**How you know it worked.** A write attempt against the quarantined Cell is rejected with a clear
read-only error, a read against it still succeeds, and a full transaction against another Cell
completes normally. Check all three. A quarantine that also broke reads is a failed quarantine.

**Reversing.** Lifting quarantine also requires dual approval. Do not lift it until P1 verification is
clean on that Cell.

---

## P3. Rebuild a Cell

**Trigger.** A Cell is confirmed compromised, or its state is untrustworthy after an incident.

**Preconditions.** The Cell is quarantined (P2) and P1 verification has been run and its output
retained, so there is a record of the state before the rebuild.

**Steps.**

1. Confirm quarantine is active. Never rebuild a Cell that is still accepting writes.
2. Tear down the Cell's service instances. The Cell is defined by configuration, so nothing
   Cell-specific exists in the code being redeployed.
3. Redeploy the service stack with that Cell's configuration unchanged: `CELL_ID`, database URL,
   Redis URL, signing key.
4. Replay the ledger to rebuild the Cell's projections. Balances and history are projections and are
   always rebuildable from the chain.
5. Run P1 verification on the rebuilt Cell.
6. Lift quarantine under dual approval.

**How you know it worked.** Verification is clean, the record count matches the count taken before
the rebuild, and the root hash matches. Zero ledger records lost is the standard. Anything less is a
failed rebuild, not a partial success.

---

## P4. Suspected key compromise

**Not implemented in Phase 2.** This procedure describes the target design (ADR 0003), not a
capability this build actually has. There is no per-Cell ledger signing key in the current code, and
no quorum ceremony tooling: the ledger's tamper-evidence today is its hash chain alone, verified by
walking it and recomputing every hash (P1), not a cryptographic signature. Steps below are recorded
as the intended procedure for when a real key exists, so a reviewer sees the design honestly rather
than a step that would fail if actually attempted. Genuine Phase 3 scope, not silently dropped.

**Trigger.** Reason to believe a Cell's signing key is exposed.

Arka has no Master Key, which is the entire point. There is no single artifact whose loss unlocks the
platform, and no single person who can recover one.

**Steps.**

1. Quarantine the affected Cell (P2).
2. Convene the quorum ceremony. Three of five independent keyholders are required. Two is not enough
   and no exception exists for urgency.
3. Rotate the Cell's signing key. Keys are per-Cell, so the blast radius of a key compromise is one
   Cell.
4. Rebuild the Cell (P3) and verify (P1).

**How you know it worked.** Verification is clean under the new key, and the old key no longer
authenticates against anything.

---

## P5. Adding a Cell

**Trigger.** Capacity growth, or shrinking the blast radius of any single failure.

Adding a Cell is a configuration change, not a code change. If adding a Cell ever requires editing a
service, that is a defect: something has branched on Cell identity and the isolation property has
been weakened.

**Steps.** Add the new Cell's configuration, provision its database and event bus, deploy the standard
service stack against it, and register it with the Cell Router so new customers can be pinned to it.

**How you know it worked.** The router pins customers to the new Cell, and the new Cell holds no
credential that reaches any existing Cell.

---

## Phase 3 demonstration sequence

The live sequence, in order. Each step maps to a procedure above, so the demonstration is the runbook
being followed rather than a separate performance.

1. Show every Cell healthy on the Recovery Console.
2. Inject the fault into one Cell.
3. Rate limiting engages and the alert fires.
4. Quarantine under dual approval (P2). Show a second browser: another Cell keeps serving throughout.
5. Rebuild the Cell from configuration and replay its ledger (P3).
6. Verify the chain in front of the panel and show zero records lost (P1).

Scripting this sequence is not cheating. It is operational discipline, and it is what a runbook is
for. The failure mode to avoid is a human deciding anything while a panel watches.
