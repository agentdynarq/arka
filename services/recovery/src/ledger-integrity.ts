import { LedgerService, PgLedgerStore } from '@arka/ledger'
import type { IntegrityEvidence } from '@arka/ledger'
import type { CellEndpoint } from './cell-health.ts'

/**
 * Verifies one Cell's ledger chain on demand (FR-23). A port, same reasoning
 * as `CellHealthChecker`: the real implementation opens a fresh Postgres
 * connection per call, since verification is on demand rather than polled,
 * and a fake implementation lets `RecoveryService`'s own logic (which Cell,
 * refusing an unknown one) be tested without a database.
 */
export interface LedgerIntegrityChecker {
  verify(endpoint: CellEndpoint, options?: { upTo?: number }): Promise<IntegrityEvidence>
}

/**
 * Opens a `PgLedgerStore` directly against the Cell's own Postgres, the same
 * one-way "observe" read `InfrastructureCellHealthChecker` already makes: the
 * control plane legitimately knows a Cell's connection string, but nothing
 * here grants a Cell a route back. Closes the connection after every call
 * rather than holding a pool per Cell, since this runs on demand, not on a
 * poll interval.
 */
export class PgLedgerIntegrityChecker implements LedgerIntegrityChecker {
  async verify(endpoint: CellEndpoint, options?: { upTo?: number }): Promise<IntegrityEvidence> {
    const store = new PgLedgerStore(endpoint.postgresUrl)
    try {
      const ledger = new LedgerService(store, { cellId: endpoint.cellId })
      return await ledger.evidence(options)
    } finally {
      await store.close()
    }
  }
}
