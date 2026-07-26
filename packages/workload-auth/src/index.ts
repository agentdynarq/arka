/**
 * workload-auth
 *
 * Short-lived, HMAC-signed workload identities. A process that cannot prove
 * what it is talks to nothing. Zero runtime dependencies, deliberately, for
 * the same reason as ledger-core: this is trust-boundary code, so it stays
 * small enough to read in one sitting.
 */

export type { WorkloadIdentity, WorkloadAuthErrorCode } from './types.ts'
export { WorkloadAuthError } from './types.ts'

export { issueWorkloadToken, verifyWorkloadToken } from './token.ts'
export type { IssueWorkloadTokenOptions, VerifyWorkloadTokenOptions } from './token.ts'
