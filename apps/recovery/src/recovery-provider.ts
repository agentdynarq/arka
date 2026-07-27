import { RecoveryService, PgQuarantineStore, PgAuditTrailStore, InfrastructureCellHealthChecker } from '@arka/recovery'
import type { CellEndpoint } from '@arka/recovery'

/** The control plane's own Postgres. Falls back to the local `docker compose` port. */
function controlPlaneDatabaseUrl(): string {
  return (
    process.env.CONTROL_PLANE_DATABASE_URL ?? 'postgres://arka_control:change-me-control-plane@localhost:5435/arka_control'
  )
}

/**
 * Reads each configured Cell's Postgres and Redis connection from the
 * environment, the same `CELL1_*` / `CELL2_*` naming `docker-compose.yml`
 * and `scripts/lib/cell-config.ts` already use. `CELL_IDS` (for example
 * `"cell-1,cell-2"`) is the same variable `apps/gateway`'s Cell Router
 * reads, so both ends of the platform agree on which Cells exist without
 * either one hardcoding a Cell id, per "a Cell is configuration, not code".
 */
function cellEndpoints(): CellEndpoint[] {
  const cellIds = (process.env.CELL_IDS ?? 'cell-1,cell-2')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0)

  return cellIds.map((cellId) => {
    const prefix = cellId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
    const postgresUser = process.env[`${prefix}_POSTGRES_USER`] ?? `arka_${cellId.replace(/-/g, '')}`
    const postgresPassword = process.env[`${prefix}_POSTGRES_PASSWORD`] ?? `change-me-${cellId}`
    const postgresDb = process.env[`${prefix}_POSTGRES_DB`] ?? `arka_${cellId.replace(/-/g, '')}`
    const postgresPort = process.env[`${prefix}_POSTGRES_PORT`] ?? '5432'
    const redisPassword = process.env[`${prefix}_REDIS_PASSWORD`] ?? `change-me-${cellId}-redis`
    const redisPort = process.env[`${prefix}_REDIS_PORT`] ?? '6379'

    return {
      cellId,
      postgresUrl: `postgres://${postgresUser}:${postgresPassword}@localhost:${postgresPort}/${postgresDb}`,
      redisUrl: `redis://:${redisPassword}@localhost:${redisPort}`,
    }
  })
}

let instance: RecoveryService | null = null

/** The one `RecoveryService` for this deployment, built from real Postgres-backed stores. Constructed once. */
export function buildRecoveryService(): RecoveryService {
  if (instance) return instance

  const connectionString = controlPlaneDatabaseUrl()
  instance = new RecoveryService({
    quarantineStore: new PgQuarantineStore(connectionString),
    auditTrailStore: new PgAuditTrailStore(connectionString),
    healthChecker: new InfrastructureCellHealthChecker(),
    cellEndpoints: cellEndpoints(),
  })
  return instance
}
