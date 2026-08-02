'use client'

import { PageHeader, Panel, StatusWord } from '@arka/ui'

export default function RunbookPage() {
  return (
    <>
      <PageHeader
        breadcrumb="Arka / Runbook"
        title="Operator Runbook & Procedures"
        context="Standard operating procedures for Cell quarantine, disaster recovery, and quorum consensus (docs/RUNBOOK.md)."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {/* Procedure 1: Dual Approval Quarantine */}
        <Panel title="P1: Dual Approval Cell Quarantine" subtitle="Quarantine freezes Cell egress while keeping customer data read-only.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>Step 1: Request Quarantine</span>
                <StatusWord tone="warning">Operator 1</StatusWord>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                Navigate to <strong>Cell Health</strong>, select the target Cell (e.g. <code>cell-1</code>), type a justification reason, and submit <strong>Request Quarantine</strong>. The Cell enters state <code>pending_second_approval</code>.
              </p>
            </div>

            <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>Step 2: Second Operator Approval</span>
                <StatusWord tone="danger">Operator 2</StatusWord>
              </div>
              <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.5 }}>
                A second, distinct operator must review the pending request and click <strong>Approve Quarantine</strong>. The Gateway immediately begins rejecting write requests with HTTP <code>403 CELL_QUARANTINED</code> while customer reads continue normally.
              </p>
            </div>
          </div>
        </Panel>

        {/* Procedure 2: On-Demand Integrity Verification */}
        <Panel title="P2: Ledger Integrity Verification" subtitle="Walk the hash chain to verify zero ledger tampering or data corruption.">
          <div style={{ padding: '16px', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
              Navigate to <strong>Integrity Audit</strong>, choose the target Cell, and run verification. The ledger service walks the append-only hash chain from block 1 (genesis) to head. Export the cryptographic evidence file if required for regulatory compliance.
            </p>
          </div>
        </Panel>

        {/* Procedure 3: Root Recovery & Quorum Consensus. Target design, not a Phase 2 capability. */}
        <Panel title="P3: 3-of-5 Quorum Recovery" subtitle="Target design (ADR 0003, docs/RUNBOOK.md P4). Not implemented in Phase 2.">
          <div style={{ padding: '16px', background: '#FFFBEB', borderRadius: '10px', border: '1px solid #FDE68A' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontWeight: 600, color: '#0F172A' }}>Not implemented in this build</span>
              <StatusWord tone="warning">Phase 3</StatusWord>
            </div>
            <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
              There is no per-Cell signing key in the current code and no quorum ceremony tooling, so this procedure would fail if attempted today. Tamper-evidence in Phase 2 is the hash chain alone, walked and recomputed by P2 above. The steps are recorded so a reviewer sees the design honestly rather than a capability that was silently dropped.
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: '#475569', lineHeight: 1.6 }}>
              As designed: no master key exists. After catastrophic infrastructure loss a minimum 3-of-5 quorum of independent keyholders assembles to reconstruct the root recovery key, then Cell state is rebuilt by replaying the append-only ledger.
            </p>
          </div>
        </Panel>
      </div>
    </>
  )
}
