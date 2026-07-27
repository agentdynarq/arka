import type { KycDocument } from './types.ts'
import type { KycDocumentStore } from './kyc-store.ts'

/** In-memory `KycDocumentStore`, used by unit tests. */
export class InMemoryKycDocumentStore implements KycDocumentStore {
  readonly #documents = new Map<string, KycDocument>()

  async save(document: KycDocument): Promise<void> {
    this.#documents.set(document.documentId, document)
  }

  async get(documentId: string): Promise<KycDocument | null> {
    return this.#documents.get(documentId) ?? null
  }
}
