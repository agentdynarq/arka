/** One Cell's connection details, as seen from the host, not from inside compose. */
export interface CellConfig {
  readonly cellId: string
  readonly connectionString: string
}

/**
 * Read every configured Cell's Postgres connection from the environment.
 *
 * There is no `CELL_IDS`-style discovery here on purpose: each Cell's
 * variables (`CELL1_POSTGRES_*`, `CELL2_POSTGRES_*`, ...) are read by name,
 * the same way docker-compose.yml addresses them, so adding a Cell is adding
 * a block of `.env` variables, never a code change. See docs/adr/0001.
 */
export function loadCellConfigs(): CellConfig[] {
  return [cellConfig('cell-1', 'CELL1'), cellConfig('cell-2', 'CELL2')]
}

function cellConfig(cellId: string, envPrefix: string): CellConfig {
  const user = required(`${envPrefix}_POSTGRES_USER`)
  const password = required(`${envPrefix}_POSTGRES_PASSWORD`)
  const db = required(`${envPrefix}_POSTGRES_DB`)
  const port = required(`${envPrefix}_POSTGRES_PORT`)

  return {
    cellId,
    connectionString: `postgres://${user}:${password}@localhost:${port}/${db}`,
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is not set. Copy .env.example to .env and fill it in.`)
  }
  return value
}
