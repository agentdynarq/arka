/**
 * Identity for one Cell. Owns FR-01 (re-verification against the preserved
 * registry), FR-02 (account opening with KYC upload), FR-03 (mandatory MFA),
 * FR-04 (step-up on risky actions) and the session/RBAC machinery every other
 * screen depends on.
 *
 * `Role` is not imported from `@arka/contracts`: this package, like
 * `@arka/accounts` and `@arka/payments`, is framework-free and has no
 * dependency on the wire-format package. The values are the same
 * (`'customer' | 'operator'`) because both describe the same domain concept,
 * not because one is derived from the other.
 */
export type Role = 'customer' | 'operator'

/** A login credential. One row per person who can authenticate, customer or operator. */
export interface CustomerRecord {
  readonly userId: string
  readonly username: string
  /** Argon2id encoded hash. Never the plaintext, never logged, never returned from any public method. */
  readonly passwordHash: string
  readonly role: Role
  /** Set for customers, null for operators, who have no `@arka/accounts` presence. */
  readonly customerId: string | null
  /** Base32 TOTP secret. MFA is mandatory (FR-03): every record has one, there is no unenrolled state. */
  readonly mfaSecret: string
  readonly failedLoginCount: number
  readonly lockedUntil: string | null
  readonly createdAt: string
}

/** One rotation family of refresh tokens, tied to one login. */
export interface SessionFamily {
  readonly familyId: string
  readonly userId: string
  readonly role: Role
  readonly revoked: boolean
  readonly createdAt: string
}

/** What a caller receives after a successful login or a successful rotation. */
export interface IssuedSession {
  readonly accessToken: string
  readonly refreshToken: string
  readonly role: Role
  readonly accessExpiresAt: string
  readonly refreshExpiresAt: string
}

/** The MFA challenge issued instead of a session. A login never completes to a session directly. */
export interface LoginChallenge {
  readonly mfaToken: string
  readonly expiresAt: string
}

export type StepUpReason = 'new_payee' | 'over_limit' | 'unrecognised_device'

/** Handed to the caller when it decides step-up is required; presented back with a TOTP code. */
export interface ActionChallenge {
  readonly actionToken: string
  readonly reason: StepUpReason
  readonly expiresAt: string
}

/** Proof that step-up completed for one specific action. Verified by whoever guards the risky action. */
export interface StepUpToken {
  readonly stepUpToken: string
  readonly reason: StepUpReason
  readonly expiresAt: string
}

/**
 * FR-01. `livenessSimulated` is always `true`, matching
 * `packages/contracts`' `reVerificationResult.livenessSimulated` literal.
 * There is no code path in this service that can produce anything else.
 */
export interface ReVerificationOutcome {
  readonly verified: boolean
  readonly livenessSimulated: true
  readonly checkedAt: string
}

/** A row in the preserved registry: what survived the 2065 collapse in backup, keyed by customer. */
export interface RegistryEntry {
  readonly customerId: string
  readonly registryDocumentId: string
  readonly fullName: string
}

export interface KycDocument {
  readonly documentId: string
  readonly filename: string
  readonly mimeType: string
  readonly sizeBytes: number
  readonly uploadedAt: string
  readonly bytes: Uint8Array
}

export type AccountOpeningStatus = 'pending_review' | 'approved' | 'rejected'

export interface AccountOpeningRequest {
  readonly fullName: string
  readonly dateOfBirth: string
  readonly email: string
  readonly phone: string
  readonly kycDocumentId: string
}

export interface AccountOpeningRecord {
  readonly customerId: string
  readonly accountId: string
  readonly fullName: string
  readonly dateOfBirth: string
  readonly email: string
  readonly phone: string
  readonly kycDocumentId: string
  readonly status: AccountOpeningStatus
  readonly openedAt: string
}

export type IdentityErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'RATE_LIMITED'
  | 'MFA_CHALLENGE_EXPIRED'
  | 'MFA_CODE_INVALID'
  | 'REFRESH_TOKEN_INVALID'
  | 'REFRESH_TOKEN_REUSED'
  | 'ACCESS_TOKEN_INVALID'
  | 'FORBIDDEN_ROLE'
  | 'ACTION_CHALLENGE_INVALID'
  | 'ACTION_CHALLENGE_EXPIRED'
  | 'STEP_UP_TOKEN_INVALID'
  | 'STEP_UP_TOKEN_EXPIRED'
  | 'KYC_DOCUMENT_NOT_FOUND'
  | 'USERNAME_ALREADY_EXISTS'

export class IdentityError extends Error {
  readonly code: IdentityErrorCode

  constructor(code: IdentityErrorCode, message: string) {
    super(message)
    this.name = 'IdentityError'
    this.code = code
  }
}
