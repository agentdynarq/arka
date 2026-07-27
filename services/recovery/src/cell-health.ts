import { isPostgresReachable } from '@arka/ledger'
import { isRedisReachable } from './redis-health.ts'

/** One Cell's connection details, as seen from the control plane. */
export interface CellEndpoint {
  readonly cellId: string
  readonly postgresUrl: string
  readonly redisUrl: string
}

/** What a `CellHealthChecker` observes, before the quarantine override is applied. */
export interface CellHealthObservation {
  readonly cellId: string
  readonly lastCheckedAt: string
  readonly latencyMs: number
  readonly infrastructureHealthy: boolean
}

/**
 * Observes one Cell's infrastructure reachability (FR-21). Quarantine
 * status is deliberately not this checker's concern: it reports what it can
 * actually observe (is Postgres up, is Redis up), and `RecoveryService`
 * layers the quarantine override on top, since quarantine is an operator
 * decision recorded in `QuarantineStore`, not an infrastructure fact.
 */
export interface CellHealthChecker {
  check(endpoint: CellEndpoint): Promise<CellHealthObservation>
}

/** Checks both Postgres and Redis reachability for one Cell, timed. */
export class InfrastructureCellHealthChecker implements CellHealthChecker {
  async check(endpoint: CellEndpoint): Promise<CellHealthObservation> {
    const startedAt = Date.now()
    const [postgresOk, redisOk] = await Promise.all([
      isPostgresReachable(endpoint.postgresUrl),
      isRedisReachable(endpoint.redisUrl),
    ])
    const latencyMs = Date.now() - startedAt

    return {
      cellId: endpoint.cellId,
      lastCheckedAt: new Date().toISOString(),
      latencyMs,
      infrastructureHealthy: postgresOk && redisOk,
    }
  }
}
