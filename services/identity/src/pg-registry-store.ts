import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { RegistryEntry } from './types.ts'
import type { RegistryStore } from './registry-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

interface RegistryRow {
  customer_id: string
  registry_document_id: string
  full_name: string
}

function rowToEntry(row: RegistryRow): RegistryEntry {
  return { customerId: row.customer_id, registryDocumentId: row.registry_document_id, fullName: row.full_name }
}

/** `RegistryStore` backed by one Cell's Postgres database, in its own `identity` schema. */
export class PgRegistryStore implements RegistryStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async seed(entry: RegistryEntry): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `INSERT INTO identity.registry_entries (customer_id, registry_document_id, full_name)
       VALUES ($1, $2, $3)
       ON CONFLICT (customer_id, registry_document_id) DO UPDATE SET full_name = EXCLUDED.full_name`,
      [entry.customerId, entry.registryDocumentId, entry.fullName]
    )
  }

  async find(customerId: string, registryDocumentId: string): Promise<RegistryEntry | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<RegistryRow>(
      'SELECT * FROM identity.registry_entries WHERE customer_id = $1 AND registry_document_id = $2',
      [customerId, registryDocumentId]
    )
    return rows[0] ? rowToEntry(rows[0]) : null
  }

  /** Drop and recreate the schema. Test and seed-reset use only. */
  async resetSchema(): Promise<void> {
    await this.#pool.query('DROP SCHEMA IF EXISTS identity CASCADE')
    this.#schemaReady = null
    await this.#ensureSchema()
  }

  /** Release the underlying connection pool. Callers own this store's lifetime. */
  async close(): Promise<void> {
    await this.#pool.end()
  }
}
