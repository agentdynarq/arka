/**
 * Thin fetch wrapper over `@arka/identity-app`. No SDK, no generated client:
 * this is a 10%-weighted client bucket following the Phase 1 wireframes, not
 * a place to build infrastructure. Every shape here matches
 * `@arka/contracts`' identity schemas.
 */
const API_BASE = process.env.NEXT_PUBLIC_IDENTITY_API_URL ?? 'http://localhost:3001'

export class ApiError extends Error {
  readonly code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

async function post<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const data = await response.json()
  if (!response.ok) {
    throw new ApiError(data.code ?? 'UNKNOWN_ERROR', data.message ?? 'Request failed')
  }
  return data as T
}

async function get<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json()
  if (!response.ok) {
    throw new ApiError(data.code ?? 'UNKNOWN_ERROR', data.message ?? 'Request failed')
  }
  return data as T
}

export interface ReVerificationResult {
  verified: boolean
  livenessSimulated: true
  checkedAt: string
}

export function reVerify(customerId: string, registryDocumentId: string): Promise<ReVerificationResult> {
  return post('/v1/identity/re-verify', { customerId, registryDocumentId })
}

export interface LoginChallenge {
  mfaToken: string
  expiresAt: string
}

export function login(username: string, password: string): Promise<LoginChallenge> {
  return post('/v1/auth/login', { username, password })
}

export interface Session {
  accessToken: string
  refreshToken: string
  role: 'customer' | 'operator'
  expiresAt: string
}

export function verifyMfa(mfaToken: string, totpCode: string): Promise<Session> {
  return post('/v1/auth/mfa/verify', { mfaToken, totpCode })
}

export interface DashboardAccount {
  accountId: string
  displayName: string
  balance: string
}

export interface Dashboard {
  username: string
  role: string
  accounts: DashboardAccount[]
}

export async function fetchDashboard(accessToken: string): Promise<Dashboard> {
  const response = await fetch(`${API_BASE}/v1/me/dashboard`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json()
  if (!response.ok) {
    throw new ApiError(data.code ?? 'UNKNOWN_ERROR', data.message ?? 'Request failed')
  }
  return data as Dashboard
}

/** Formats a minor-units balance string (e.g. "87500") as a decimal amount ("875.00"). Display only, never used for arithmetic. */
export function formatMinorUnits(value: string): string {
  const n = BigInt(value)
  const negative = n < 0n
  const abs = negative ? -n : n
  const whole = abs / 100n
  const cents = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${whole}.${cents}`
}

/**
 * Reverses `formatMinorUnits`: a decimal amount typed by a customer ("50" or
 * "50.5") to a minor-units string ("5000", "5050"). Throws on anything that
 * is not a plain non-negative decimal, since this is the one place client
 * input becomes the exact string the server treats as money.
 */
export function toMinorUnits(decimal: string): string {
  const trimmed = decimal.trim()
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(trimmed)
  if (!match) {
    throw new ApiError('INVALID_AMOUNT', 'Enter an amount like 50 or 50.00')
  }
  const whole = match[1]!
  const cents = (match[2] ?? '').padEnd(2, '0')
  const minorUnits = BigInt(whole) * 100n + BigInt(cents || '0')
  if (minorUnits <= 0n) {
    throw new ApiError('INVALID_AMOUNT', 'Amount must be greater than zero')
  }
  return minorUnits.toString()
}

/** FR-06, FR-08. One line of transaction history, screen W2. */
export interface HistoryLine {
  seq: number
  at: string
  direction: 'debit' | 'credit'
  amount: string
  counterpartyHint: string
  ledgerBlockHash: string
  confirmed: true
}

/** `limit` is FR-15: low-bandwidth mode asks for only the newest few lines instead of the full history. */
export function fetchHistory(accessToken: string, accountId: string, limit?: number): Promise<HistoryLine[]> {
  const query = limit !== undefined ? `?limit=${limit}` : ''
  return get(`/v1/accounts/${encodeURIComponent(accountId)}/history${query}`, accessToken)
}

export type TransferOutcome =
  | { transferId: string; status: 'confirmed'; ledgerBlockSeq: number }
  | { stepUpRequired: true; reason: 'new_payee' }

/** FR-09, FR-04, screen W3. `stepUpToken` is omitted on the first attempt; supplied once step-up completes. */
export function transfer(
  accessToken: string,
  idempotencyKey: string,
  fromAccountId: string,
  toAccountId: string,
  amountMinorUnits: string,
  stepUpToken?: string
): Promise<TransferOutcome> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Idempotency-Key': idempotencyKey,
  }
  if (stepUpToken) headers['X-Step-Up-Token'] = stepUpToken
  return post('/v1/payments/transfers', { fromAccountId, toAccountId, amount: amountMinorUnits }, headers)
}

export interface ActionChallenge {
  actionToken: string
  reason: 'new_payee' | 'over_limit' | 'unrecognised_device'
  expiresAt: string
}

export type AgentCashDirection = 'cash_in' | 'cash_out'

export interface AgentCashRequestResult {
  requestId: string
  expiresAt: string
}

/**
 * FR-16, screen W4. Unauthenticated, same as the backend: no agent login
 * system exists in this scope, and never returns the OTP, it goes to the
 * customer's own notification inbox.
 */
export function requestAgentCash(
  agentId: string,
  agentAccountId: string,
  customerAccountId: string,
  direction: AgentCashDirection,
  amountMinorUnits: string
): Promise<AgentCashRequestResult> {
  return post('/v1/payments/agent-cash/request', { agentId, agentAccountId, customerAccountId, direction, amount: amountMinorUnits })
}

export interface AgentCashCompleteResult {
  transferId: string
  status: 'confirmed'
  ledgerBlockSeq: number
}

/** The OTP is read by the agent from what the customer tells them, never fetched by this app. */
export function completeAgentCash(idempotencyKey: string, requestId: string, otpCode: string): Promise<AgentCashCompleteResult> {
  return post('/v1/payments/agent-cash/complete', { requestId, otpCode }, { 'Idempotency-Key': idempotencyKey })
}

export function requestStepUpChallenge(accessToken: string, reason: ActionChallenge['reason']): Promise<ActionChallenge> {
  return post('/v1/identity/step-up/challenge', { reason }, { Authorization: `Bearer ${accessToken}` })
}

export interface StepUpToken {
  stepUpToken: string
  reason: string
  expiresAt: string
}

export function completeStepUp(actionToken: string, reason: string, totpCode: string): Promise<StepUpToken> {
  return post('/v1/identity/step-up/verify', { actionToken, reason, totpCode })
}
