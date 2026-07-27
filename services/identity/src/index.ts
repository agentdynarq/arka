/**
 * Identity for one Cell. Owns FR-01 (re-verification), FR-02 (account
 * opening with KYC), FR-03 (mandatory MFA), FR-04 (step-up), sessions with
 * refresh rotation, RBAC, and login rate limiting and lockout.
 *
 * Framework-free. The HTTP layer (`apps/identity`) is a thin adapter over
 * `IdentityService`, and the Postgres adapters are thin implementations of
 * each store port. Everything that decides who is authenticated and what
 * they may do lives here and is testable without a server or a database.
 */

export { IdentityService } from './service.ts'
export type { IdentityServiceOptions } from './service.ts'

export { IdentityError } from './types.ts'
export type {
  Role,
  CustomerRecord,
  SessionFamily,
  IssuedSession,
  LoginChallenge,
  StepUpReason,
  ActionChallenge,
  StepUpToken,
  ReVerificationOutcome,
  RegistryEntry,
  KycDocument,
  AccountOpeningStatus,
  AccountOpeningRequest,
  AccountOpeningRecord,
  IdentityErrorCode,
} from './types.ts'

export { hashPassword, verifyPassword } from './password.ts'
export { generateTotpSecret, totpAt, verifyTotp } from './totp.ts'

export type { UserStore } from './user-store.ts'
export { InMemoryUserStore } from './memory-user-store.ts'
export { PgUserStore } from './pg-user-store.ts'

export type { SessionStore, RefreshTokenRow, AccessTokenRow, SessionFamilyRow } from './session-store.ts'
export { InMemorySessionStore } from './memory-session-store.ts'
export { PgSessionStore } from './pg-session-store.ts'

export type { RateLimiter, RateLimitOutcome } from './rate-limiter.ts'
export { InMemoryRateLimiter } from './memory-rate-limiter.ts'
export { PgRateLimiter } from './pg-rate-limiter.ts'

export type { RegistryStore } from './registry-store.ts'
export { InMemoryRegistryStore } from './memory-registry-store.ts'
export { PgRegistryStore } from './pg-registry-store.ts'

export type { KycDocumentStore } from './kyc-store.ts'
export { InMemoryKycDocumentStore } from './memory-kyc-store.ts'
export { PgKycDocumentStore } from './pg-kyc-store.ts'

export type { AccountOpeningStore } from './account-opening-store.ts'
export { InMemoryAccountOpeningStore } from './memory-account-opening-store.ts'
export { PgAccountOpeningStore } from './pg-account-opening-store.ts'
