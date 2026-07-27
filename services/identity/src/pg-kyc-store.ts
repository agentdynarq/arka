import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Pool } from 'pg'
import type { KycDocument } from './types.ts'
import type { KycDocumentStore } from './kyc-store.ts'

const here = dirname(fileURLToPath(import.meta.url))
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8')

interface KycRow {
  document_id: string
  filename: string
  mime_type: string
  size_bytes: number
  uploaded_at: string
  bytes: Buffer
}

function rowToDocument(row: KycRow): KycDocument {
  return {
    documentId: row.document_id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    bytes: new Uint8Array(row.bytes),
  }
}

/** `KycDocumentStore` backed by one Cell's Postgres database, in its own `identity` schema. */
export class PgKycDocumentStore implements KycDocumentStore {
  readonly #pool: Pool
  #schemaReady: Promise<void> | null = null

  constructor(connectionString: string) {
    this.#pool = new Pool({ connectionString })
  }

  async #ensureSchema(): Promise<void> {
    this.#schemaReady ??= this.#pool.query(SCHEMA_SQL).then(() => undefined)
    return this.#schemaReady
  }

  async save(document: KycDocument): Promise<void> {
    await this.#ensureSchema()
    await this.#pool.query(
      `INSERT INTO identity.kyc_documents (document_id, filename, mime_type, size_bytes, uploaded_at, bytes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        document.documentId,
        document.filename,
        document.mimeType,
        document.sizeBytes,
        document.uploadedAt,
        Buffer.from(document.bytes),
      ]
    )
  }

  async get(documentId: string): Promise<KycDocument | null> {
    await this.#ensureSchema()
    const { rows } = await this.#pool.query<KycRow>(
      'SELECT * FROM identity.kyc_documents WHERE document_id = $1',
      [documentId]
    )
    return rows[0] ? rowToDocument(rows[0]) : null
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
