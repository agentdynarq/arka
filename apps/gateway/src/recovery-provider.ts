import { RecoveryService, PgQuarantineStore, PgAuditTrailStore, InfrastructureCellHealthChecker } from '@arka/recovery'
import type { CellEndpoint } from '@arka/recovery'

/**
 * A small, deliberate duplicate of `apps/recovery/src/recovery-provider.ts`:
 * the gateway only ever calls `isQuarantined` (a read), never a mutation, so
 * pulling the construction logic into a shared package for two ~30-line
 * copies is not worth the coupling between two otherwise-independent apps.
 */
function controlPlaneDatabaseUrl(): string {
  return (
    process.env.CONTROL_PLANE_DATABASE_URL ?? 'postgres://arka_control:change-me-control-plane@localhost:5435/arka_control'
  )
}

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

/** Read-only from the gateway's side: only ever used to check `isQuarantined`. */
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
