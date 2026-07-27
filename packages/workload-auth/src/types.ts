/**
 * A workload identity: the short-lived credential a service presents to prove
 * what it is on a service-to-service call. Being on the network grants no
 * trust by itself. See CONTEXT.md and docs/adr/0001.
 */
export interface WorkloadIdentity {
  readonly subject: string
  readonly cellId: string
  /** Epoch seconds. */
  readonly issuedAt: number
  /** Epoch seconds. */
  readonly expiresAt: number
  readonly nonce: string
}

export type WorkloadAuthErrorCode = 'MALFORMED' | 'UNSUPPORTED_ALGORITHM' | 'BAD_SIGNATURE' | 'EXPIRED'

export class WorkloadAuthError extends Error {
  readonly code: WorkloadAuthErrorCode

  constructor(code: WorkloadAuthErrorCode, message: string) {
    super(message)
    this.name = 'WorkloadAuthError'
    this.code = code
  }
}
