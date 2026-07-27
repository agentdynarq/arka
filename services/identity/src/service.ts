import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { AccountsService } from '@arka/accounts'
import { hashPassword, verifyPassword } from './password.ts'
import { verifyTotp } from './totp.ts'
import { IdentityError } from './types.ts'
import type {
  AccountOpeningRecord,
  AccountOpeningRequest,
  ActionChallenge,
  CustomerRecord,
  IssuedSession,
  KycDocument,
  LoginChallenge,
  ReVerificationOutcome,
  Role,
  StepUpReason,
  StepUpToken,
} from './types.ts'
import type { UserStore } from './user-store.ts'
import type { SessionStore } from './session-store.ts'
import type { RateLimiter } from './rate-limiter.ts'
import type { RegistryStore } from './registry-store.ts'
import type { KycDocumentStore } from './kyc-store.ts'
import type { AccountOpeningStore } from './account-opening-store.ts'

export interface IdentityServiceOptions {
  readonly userStore: UserStore
  readonly sessionStore: SessionStore
  readonly rateLimiter: RateLimiter
  readonly registryStore: RegistryStore
  readonly kycStore: KycDocumentStore
  readonly accountOpenings: AccountOpeningStore
  readonly accounts: AccountsService
  /** How long an access token is valid, independent of refresh rotation. Default 15 minutes. */
  readonly accessTtlMs?: number
  /** How long an unused refresh token is valid. Default 30 days. */
  readonly refreshTtlMs?: number
  /** How long an MFA challenge from `login` stays redeemable. Default 5 minutes. */
  readonly mfaChallengeTtlMs?: number
  /** How long a step-up action challenge stays redeemable. Default 5 minutes. */
  readonly actionChallengeTtlMs?: number
  /** How long a completed step-up proof stays valid for the guarded action. Default 5 minutes. */
  readonly stepUpTtlMs?: number
  /** Consecutive failures before an account locks. Default 5. */
  readonly maxFailedLogins?: number
  /** Lockout duration once triggered. Default 15 minutes. */
  readonly lockoutMs?: number
  /** Login attempts allowed per username per window, independent of lockout. Default 10 per minute. */
  readonly loginRateLimit?: { readonly limit: number; readonly windowMs: number }
}

interface MfaChallengeRecord {
  readonly userId: string
  readonly expiresAt: number
}

interface ActionChallengeRecord {
  readonly userId: string
  readonly reason: StepUpReason
  readonly expiresAt: number
}

interface StepUpTokenRecord {
  readonly userId: string
  readonly reason: StepUpReason
  readonly expiresAt: number
}

/**
 * Precomputed once, on first use, so a login against an unknown username
 * still runs a real Argon2 verify. Without this, an unknown username returns
 * measurably faster than a known one with a wrong password, which leaks
 * which usernames exist through response timing.
 */
let decoyHashPromise: Promise<string> | null = null
function decoyHash(): Promise<string> {
  decoyHashPromise ??= hashPassword(randomBytes(32).toString('hex'))
  return decoyHashPromise
}

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function newOpaqueToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Identity for one Cell. Framework-free, same reasoning as `LedgerService`,
 * `AccountsService` and `PaymentsService`: the behaviour that decides who is
 * authenticated and what they are allowed to do is testable without a server
 * or a database.
 *
 * Composes several storage ports (`UserStore`, `SessionStore`,
 * `RateLimiter`, `RegistryStore`, `KycDocumentStore`) and `@arka/accounts`'
 * public API, never any other service's storage.
 */
export class IdentityService {
  readonly #userStore: UserStore
  readonly #sessionStore: SessionStore
  readonly #rateLimiter: RateLimiter
  readonly #registryStore: RegistryStore
  readonly #kycStore: KycDocumentStore
  readonly #accountOpenings: AccountOpeningStore
  readonly #accounts: AccountsService

  readonly #accessTtlMs: number
  readonly #refreshTtlMs: number
  readonly #mfaChallengeTtlMs: number
  readonly #actionChallengeTtlMs: number
  readonly #stepUpTtlMs: number
  readonly #maxFailedLogins: number
  readonly #lockoutMs: number
  readonly #loginRateLimit: { readonly limit: number; readonly windowMs: number }

  /**
   * MFA challenges, pending step-up challenges and completed step-up proofs
   * are short-lived (minutes) and scoped to one Identity process. Phase 2
   * runs one Identity instance per Cell, so keeping them in memory rather
   * than in Postgres is a deliberate simplification, not an oversight: it
   * costs a restart losing in-flight challenges, which is an acceptable
   * trade for not adding a third storage port for state that never needs to
   * outlive a few minutes. See README.md.
   */
  readonly #mfaChallenges = new Map<string, MfaChallengeRecord>()
  readonly #actionChallenges = new Map<string, ActionChallengeRecord>()
  readonly #stepUpTokens = new Map<string, StepUpTokenRecord>()

  constructor(options: IdentityServiceOptions) {
    this.#userStore = options.userStore
    this.#sessionStore = options.sessionStore
    this.#rateLimiter = options.rateLimiter
    this.#registryStore = options.registryStore
    this.#kycStore = options.kycStore
    this.#accountOpenings = options.accountOpenings
    this.#accounts = options.accounts

    this.#accessTtlMs = options.accessTtlMs ?? 15 * 60 * 1000
    this.#refreshTtlMs = options.refreshTtlMs ?? 30 * 24 * 60 * 60 * 1000
    this.#mfaChallengeTtlMs = options.mfaChallengeTtlMs ?? 5 * 60 * 1000
    this.#actionChallengeTtlMs = options.actionChallengeTtlMs ?? 5 * 60 * 1000
    this.#stepUpTtlMs = options.stepUpTtlMs ?? 5 * 60 * 1000
    this.#maxFailedLogins = options.maxFailedLogins ?? 5
    this.#lockoutMs = options.lockoutMs ?? 15 * 60 * 1000
    this.#loginRateLimit = options.loginRateLimit ?? { limit: 10, windowMs: 60 * 1000 }
  }

  // ---------------------------------------------------------------------
  // Registration (test and seed use: real signup is not in Phase 2 scope,
  // account opening below creates identity-level provisioning, not login
  // credentials, per the task boundary agreed with lane A)
  // ---------------------------------------------------------------------

  /** Creates a login credential with a freshly generated MFA secret. Returns the secret once, for enrollment. */
  async createUser(params: {
    readonly username: string
    readonly password: string
    readonly role: Role
    readonly customerId: string | null
    readonly mfaSecret: string
  }): Promise<CustomerRecord> {
    const record: CustomerRecord = {
      userId: randomUUID(),
      username: params.username,
      passwordHash: await hashPassword(params.password),
      role: params.role,
      customerId: params.customerId,
      mfaSecret: params.mfaSecret,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: new Date().toISOString(),
    }
    await this.#userStore.create(record)
    return record
  }

  // ---------------------------------------------------------------------
  // Login, MFA (FR-03), sessions with refresh rotation
  // ---------------------------------------------------------------------

  /**
   * A login never completes to a session directly (FR-03): success returns
   * an MFA challenge, never a token. Rate limited per username, independent
   * of the per-account lockout below, so a burst against one real account
   * cannot dodge lockout by varying the password on every attempt within the
   * lockout threshold's counting window... it still hits the same counter,
   * because both are keyed by username, not by password guessed.
   */
  async login(username: string, password: string): Promise<LoginChallenge> {
    const rate = await this.#rateLimiter.hit(`login:${username}`, this.#loginRateLimit.limit, this.#loginRateLimit.windowMs)
    if (!rate.allowed) {
      throw new IdentityError('RATE_LIMITED', `Too many login attempts for "${username}", try again later`)
    }

    const user = await this.#userStore.getByUsername(username)
    if (!user) {
      await verifyPassword(await decoyHash(), password)
      throw new IdentityError('INVALID_CREDENTIALS', 'Invalid username or password')
    }

    if (user.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
      throw new IdentityError('ACCOUNT_LOCKED', `Account "${username}" is locked until ${user.lockedUntil}`)
    }

    const passwordOk = await verifyPassword(user.passwordHash, password)
    if (!passwordOk) {
      const count = await this.#userStore.incrementFailedLogins(user.userId)
      if (count >= this.#maxFailedLogins) {
        const lockedUntil = new Date(Date.now() + this.#lockoutMs).toISOString()
        await this.#userStore.setLockedUntil(user.userId, lockedUntil)
      }
      throw new IdentityError('INVALID_CREDENTIALS', 'Invalid username or password')
    }

    await this.#userStore.resetFailedLogins(user.userId)
    await this.#userStore.setLockedUntil(user.userId, null)

    const mfaToken = newOpaqueToken()
    const expiresAt = Date.now() + this.#mfaChallengeTtlMs
    this.#mfaChallenges.set(mfaToken, { userId: user.userId, expiresAt })

    return { mfaToken, expiresAt: new Date(expiresAt).toISOString() }
  }

  /** Redeems an MFA challenge with a TOTP code (FR-03). Success issues a real session. */
  async verifyMfa(mfaToken: string, totpCode: string): Promise<IssuedSession> {
    const rate = await this.#rateLimiter.hit(`mfa:${mfaToken}`, 5, this.#mfaChallengeTtlMs)
    if (!rate.allowed) {
      throw new IdentityError('RATE_LIMITED', 'Too many MFA attempts for this challenge')
    }

    const challenge = this.#mfaChallenges.get(mfaToken)
    if (!challenge || challenge.expiresAt < Date.now()) {
      this.#mfaChallenges.delete(mfaToken)
      throw new IdentityError('MFA_CHALLENGE_EXPIRED', 'MFA challenge is invalid or has expired')
    }

    const user = await this.#userStore.getById(challenge.userId)
    if (!user || !verifyTotp(user.mfaSecret, totpCode)) {
      throw new IdentityError('MFA_CODE_INVALID', 'Invalid TOTP code')
    }

    this.#mfaChallenges.delete(mfaToken)
    return this.#issueSession(user.userId, user.role)
  }

  async #issueSession(userId: string, role: Role): Promise<IssuedSession> {
    const familyId = await this.#sessionStore.createFamily(userId, role)
    return this.#issueTokenPair(familyId, userId, role)
  }

  async #issueTokenPair(familyId: string, userId: string, role: Role): Promise<IssuedSession> {
    const now = Date.now()
    const accessToken = newOpaqueToken()
    const refreshToken = newOpaqueToken()
    const accessExpiresAt = new Date(now + this.#accessTtlMs).toISOString()
    const refreshExpiresAt = new Date(now + this.#refreshTtlMs).toISOString()

    await this.#sessionStore.insertAccessToken({
      tokenHash: sha256Hex(accessToken),
      familyId,
      userId,
      role,
      expiresAt: accessExpiresAt,
    })
    await this.#sessionStore.insertRefreshToken({
      tokenHash: sha256Hex(refreshToken),
      familyId,
      usedAt: null,
      expiresAt: refreshExpiresAt,
    })

    return { accessToken, refreshToken, role, accessExpiresAt, refreshExpiresAt }
  }

  /**
   * Rotates a refresh token. A reused refresh token, one already marked
   * used by an earlier rotation, invalidates the whole family rather than
   * just itself: that is the signal that a token was stolen and both the
   * legitimate holder and the thief are now racing to use it.
   */
  async refresh(refreshToken: string): Promise<IssuedSession> {
    const tokenHash = sha256Hex(refreshToken)
    const claim = await this.#sessionStore.claimRefreshToken(tokenHash)

    if (!claim.claimed) {
      if (claim.existing === null) {
        throw new IdentityError('REFRESH_TOKEN_INVALID', 'Refresh token is invalid')
      }
      // The hash exists but was already claimed by an earlier rotation: reuse. Kill the whole family.
      await this.#sessionStore.revokeFamily(claim.existing.familyId)
      throw new IdentityError('REFRESH_TOKEN_REUSED', 'Refresh token was already used; session family revoked')
    }

    if (Date.parse(claim.row.expiresAt) < Date.now()) {
      throw new IdentityError('REFRESH_TOKEN_INVALID', 'Refresh token has expired')
    }

    const family = await this.#sessionStore.getFamily(claim.row.familyId)
    if (!family || family.revoked) {
      throw new IdentityError('REFRESH_TOKEN_INVALID', 'Refresh token belongs to a revoked session')
    }

    return this.#issueTokenPair(claim.row.familyId, family.userId, family.role)
  }

  /** Verifies an access token, for any endpoint guarding a session. Null if invalid, expired, or the family is revoked. */
  async verifyAccessToken(accessToken: string): Promise<{ userId: string; role: Role } | null> {
    const row = await this.#sessionStore.getAccessToken(sha256Hex(accessToken))
    if (!row) return null
    if (Date.parse(row.expiresAt) < Date.now()) return null

    const family = await this.#sessionStore.getFamily(row.familyId)
    if (!family || family.revoked) return null

    return { userId: row.userId, role: row.role }
  }

  /**
   * The public-facing profile for a session's user: no password hash, no
   * MFA secret, ever. Exists for callers (a dashboard endpoint, an
   * operator console) that need to know which customer a session belongs
   * to, without reaching into `UserStore` themselves.
   */
  async getProfile(userId: string): Promise<{ userId: string; username: string; role: Role; customerId: string | null } | null> {
    const user = await this.#userStore.getById(userId)
    if (!user) return null
    return { userId: user.userId, username: user.username, role: user.role, customerId: user.customerId }
  }

  /** RBAC: throws unless `session.role` is `required`. A customer token never reaches an operator-only action, and vice versa. */
  assertRole(session: { readonly role: Role }, required: Role): void {
    if (session.role !== required) {
      throw new IdentityError('FORBIDDEN_ROLE', `Requires role "${required}", session has "${session.role}"`)
    }
  }

  // ---------------------------------------------------------------------
  // Step-up authentication (FR-04)
  // ---------------------------------------------------------------------

  /**
   * Issued by whoever decides an action is risky (a new payee, an
   * over-limit amount, an unrecognised device), at the moment of that
   * action, not at login. The reason travels with the challenge for the
   * client to explain itself, but never changes what proof is required: a
   * TOTP code, same as MFA.
   */
  async issueActionChallenge(accessToken: string, reason: StepUpReason): Promise<ActionChallenge> {
    const session = await this.verifyAccessToken(accessToken)
    if (!session) {
      throw new IdentityError('ACCESS_TOKEN_INVALID', 'Access token is invalid or expired')
    }

    const actionToken = newOpaqueToken()
    const expiresAt = Date.now() + this.#actionChallengeTtlMs
    this.#actionChallenges.set(actionToken, { userId: session.userId, reason, expiresAt })

    return { actionToken, reason, expiresAt: new Date(expiresAt).toISOString() }
  }

  /** Redeems an action challenge with a TOTP code, producing a one-time proof the guarded action can check. */
  async completeStepUp(actionToken: string, reason: StepUpReason, totpCode: string): Promise<StepUpToken> {
    const challenge = this.#actionChallenges.get(actionToken)
    if (!challenge || challenge.expiresAt < Date.now()) {
      this.#actionChallenges.delete(actionToken)
      throw new IdentityError('ACTION_CHALLENGE_EXPIRED', 'Step-up challenge is invalid or has expired')
    }
    if (challenge.reason !== reason) {
      throw new IdentityError('ACTION_CHALLENGE_INVALID', 'Step-up reason does not match the issued challenge')
    }

    const user = await this.#userStore.getById(challenge.userId)
    if (!user || !verifyTotp(user.mfaSecret, totpCode)) {
      throw new IdentityError('MFA_CODE_INVALID', 'Invalid TOTP code')
    }

    this.#actionChallenges.delete(actionToken)

    const stepUpToken = newOpaqueToken()
    const expiresAt = Date.now() + this.#stepUpTtlMs
    this.#stepUpTokens.set(stepUpToken, { userId: user.userId, reason, expiresAt })

    return { stepUpToken, reason, expiresAt: new Date(expiresAt).toISOString() }
  }

  /**
   * Consumes a step-up proof. Single-use: the guarded action checks this
   * once, immediately before executing, and a second attempt to spend the
   * same proof finds nothing, the same one-shot reasoning as an idempotency
   * key in `@arka/payments`.
   */
  async verifyStepUpToken(stepUpToken: string, reason: StepUpReason): Promise<{ userId: string } | null> {
    const record = this.#stepUpTokens.get(stepUpToken)
    if (!record || record.expiresAt < Date.now() || record.reason !== reason) {
      this.#stepUpTokens.delete(stepUpToken)
      return null
    }
    this.#stepUpTokens.delete(stepUpToken)
    return { userId: record.userId }
  }

  // ---------------------------------------------------------------------
  // FR-01: re-verification against the preserved registry
  // ---------------------------------------------------------------------

  /**
   * `livenessSimulated` is always `true`. There is no branch in this method
   * that can produce anything else, matching the literal type in
   * `packages/contracts`' `reVerificationResult`.
   */
  async reVerify(customerId: string, registryDocumentId: string): Promise<ReVerificationOutcome> {
    const entry = await this.#registryStore.find(customerId, registryDocumentId)
    return {
      verified: entry !== null,
      livenessSimulated: true,
      checkedAt: new Date().toISOString(),
    }
  }

  // ---------------------------------------------------------------------
  // FR-02: account opening with KYC document upload
  // ---------------------------------------------------------------------

  async uploadKycDocument(filename: string, mimeType: string, bytes: Uint8Array): Promise<KycDocument> {
    const document: KycDocument = {
      documentId: randomUUID(),
      filename,
      mimeType,
      sizeBytes: bytes.byteLength,
      uploadedAt: new Date().toISOString(),
      bytes,
    }
    await this.#kycStore.save(document)
    return document
  }

  /**
   * Opens a new account online. Phase 2 has no operator KYC review queue
   * built, so a submission with a document on file is approved immediately
   * rather than left `pending_review` forever; the status column stays
   * meaningful for when a review step exists.
   *
   * On approval this provisions a real account through
   * `AccountsService.open`, the integration point with `@arka/accounts`: a
   * newly opened account is visible to Accounts immediately, not just
   * recorded here with nothing on the other side.
   */
  async openAccount(request: AccountOpeningRequest): Promise<AccountOpeningRecord> {
    const document = await this.#kycStore.get(request.kycDocumentId)
    if (!document) {
      throw new IdentityError('KYC_DOCUMENT_NOT_FOUND', `No KYC document "${request.kycDocumentId}" on file`)
    }

    const customerId = `cust-${randomUUID()}`
    const accountId = `customer:${customerId}`

    await this.#accounts.open(accountId, customerId, request.fullName)

    const record: AccountOpeningRecord = {
      customerId,
      accountId,
      fullName: request.fullName,
      dateOfBirth: request.dateOfBirth,
      email: request.email,
      phone: request.phone,
      kycDocumentId: request.kycDocumentId,
      status: 'approved',
      openedAt: new Date().toISOString(),
    }
    await this.#accountOpenings.save(record)
    return record
  }

  async getAccountOpening(customerId: string): Promise<AccountOpeningRecord | null> {
    return this.#accountOpenings.get(customerId)
  }
}
