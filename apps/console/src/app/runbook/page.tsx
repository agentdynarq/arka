'use client'

import { PageHeader, Panel, StatusWord } from '@arka/ui'

/**
 * The operator-facing summary of `docs/RUNBOOK.md`. Deliberately a summary
 * and not a second copy of it: the file stays the source of truth, this is
 * the version an operator reads with the console already open. P3 is marked
 * as unbuilt here for the same reason RUNBOOK.md P4 marks it, so the two
 * never disagree about what this build can actually do.
 */
export default function RunbookPage() {
  return (
    <>
      <PageHeader
        breadcrumb="Arka / Runbook"
        title="Operator runbook"
        context="Standing procedures for Cell quarantine, integrity verification and root recovery. Source of truth is docs/RUNBOOK.md."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
        <Panel title="P1: dual-approval Cell quarantine" subtitle="Quarantine makes a Cell read-only. Customer reads continue.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className="ui-tile">
              <div className="ui-tile__heading">
                Step 1: request quarantine
                <StatusWord tone="warning">Operator 1</StatusWord>
              </div>
              <p className="ui-tile__body">
                Open <strong>Cell health</strong>, select the target Cell, type a justification reason, and submit{' '}
                <strong>Request quarantine</strong>. The Cell enters state <code>pending_second_approval</code>.
              </p>
            </div>

            <div className="ui-tile">
              <div className="ui-tile__heading">
                Step 2: second operator approval
                <StatusWord tone="danger">Operator 2</StatusWord>
              </div>
              <p className="ui-tile__body">
                A second, distinct operator reviews the pending request and approves it. The gateway then rejects writes
                with <code>403 CELL_QUARANTINED</code> while reads continue normally. One operator cannot do both halves.
              </p>
            </div>
          </div>
        </Panel>

        <Panel title="P2: ledger integrity verification" subtitle="Walk the hash chain and recompute every hash.">
          <div className="ui-tile">
            <p className="ui-tile__body">
              Open <strong>Integrity audit</strong>, choose the target Cell, and run verification. The ledger service walks
              the append-only chain from genesis to head, recomputing each hash. Export the evidence file for a record that
              can be checked independently later.
            </p>
          </div>
        </Panel>

        <Panel title="P3: 3-of-5 quorum recovery" subtitle="Target design (ADR 0003, docs/RUNBOOK.md P4). Not implemented in Phase 2.">
          <div className="ui-tile ui-tile--warning">
            <div className="ui-tile__heading">
              Not implemented in this build
              <StatusWord tone="warning">Phase 3</StatusWord>
            </div>
            <p className="ui-tile__body">
              There is no per-Cell signing key in the current code and no quorum ceremony tooling, so this procedure would
              fail if attempted today. Tamper-evidence in Phase 2 is the hash chain alone, walked and recomputed by P2
              above. The steps are recorded so a reviewer sees the design honestly rather than a capability that was
              silently dropped.
            </p>
            <p className="ui-tile__body">
              As designed: no master key exists. After catastrophic infrastructure loss a minimum 3-of-5 quorum of
              independent keyholders assembles to reconstruct the root recovery key, then Cell state is rebuilt by
              replaying the append-only ledger.
            </p>
          </div>
        </Panel>
      </div>
    </>
  )
}
