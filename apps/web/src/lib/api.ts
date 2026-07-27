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

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
