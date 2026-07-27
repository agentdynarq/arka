import type { KycDocument } from './types.ts'

/** FR-02: KYC document metadata and bytes, referenced by id from an account-opening request. */
export interface KycDocumentStore {
  save(document: KycDocument): Promise<void>
  get(documentId: string): Promise<KycDocument | null>
}
