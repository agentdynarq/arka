/**
 * Issue and verify short-lived, HMAC-signed workload tokens.
 *
 * The format is deliberately not JWT. A hand-rolled three-part token with a
 * fixed algorithm keeps this package at zero runtime dependencies, the same
 * reasoning ledger-core uses, and this is the package that guards every
 * internal call, so a smaller audit surface matters more than a standard.
 *
 * Verification checks the signature over the raw encoded header and payload
 * before parsing either as JSON, so nothing unauthenticated is ever trusted
 * enough to be decoded into a shape and read from.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { base64UrlDecodeToString, base64UrlEncode, canonicalJson } from './encoding.ts'
import { WorkloadAuthError } from './types.ts'
import type { WorkloadIdentity } from './types.ts'

const ALGORITHM = 'HS256'
const VERSION = 1

interface Header {
  alg: typeof ALGORITHM
  v: typeof VERSION
}

export interface IssueWorkloadTokenOptions {
  subject: string
  cellId: string
  signingKey: string
  ttlSeconds: number
  now?: () => number
}

export function issueWorkloadToken(options: IssueWorkloadTokenOptions): string {
  if (options.ttlSeconds <= 0) {
    throw new WorkloadAuthError('MALFORMED', 'ttlSeconds must be strictly positive')
  }

  const now = options.now ? options.now() : Math.floor(Date.now() / 1000)
  const header: Header = { alg: ALGORITHM, v: VERSION }
  const payload: WorkloadIdentity = {
    subject: options.subject,
    cellId: options.cellId,
    issuedAt: now,
    expiresAt: now + options.ttlSeconds,
    nonce: randomBytes(16).toString('hex'),
  }

  const headerPart = base64UrlEncode(canonicalJson(header))
  const payloadPart = base64UrlEncode(canonicalJson(payload))
  const signaturePart = sign(`${headerPart}.${payloadPart}`, options.signingKey)

  return `${headerPart}.${payloadPart}.${signaturePart}`
}

export interface VerifyWorkloadTokenOptions {
  now?: () => number
}

export function verifyWorkloadToken(
  token: string,
  signingKey: string,
  options: VerifyWorkloadTokenOptions = {},
): WorkloadIdentity {
  const parts = token.split('.')
  if (parts.length !== 3) {
    throw new WorkloadAuthError('MALFORMED', 'a workload token has exactly three parts')
  }
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]

  const expectedSignature = sign(`${headerPart}.${payloadPart}`, signingKey)
  if (!constantTimeEqual(signaturePart, expectedSignature)) {
    throw new WorkloadAuthError('BAD_SIGNATURE', 'signature does not match')
  }

  let header: unknown
  let payload: unknown
  try {
    header = JSON.parse(base64UrlDecodeToString(headerPart))
    payload = JSON.parse(base64UrlDecodeToString(payloadPart))
  } catch {
    throw new WorkloadAuthError('MALFORMED', 'header or payload is not valid JSON')
  }

  assertHeaderShape(header)
  assertPayloadShape(payload)

  const now = options.now ? options.now() : Math.floor(Date.now() / 1000)
  if (payload.expiresAt <= now) {
    throw new WorkloadAuthError('EXPIRED', `token expired at ${payload.expiresAt}`)
  }

  return payload
}

function sign(data: string, key: string): string {
  return createHmac('sha256', key).update(data).digest('base64url')
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) {
    return false
  }
  return timingSafeEqual(bufA, bufB)
}

function assertHeaderShape(value: unknown): asserts value is Header {
  const v = value as Record<string, unknown> | null
  if (typeof v !== 'object' || v === null || v.alg !== ALGORITHM || v.v !== VERSION) {
    throw new WorkloadAuthError('UNSUPPORTED_ALGORITHM', 'unsupported or malformed header')
  }
}

function assertPayloadShape(value: unknown): asserts value is WorkloadIdentity {
  const v = value as Record<string, unknown> | null
  if (
    typeof v !== 'object' ||
    v === null ||
    typeof v.subject !== 'string' ||
    typeof v.cellId !== 'string' ||
    typeof v.issuedAt !== 'number' ||
    typeof v.expiresAt !== 'number' ||
    typeof v.nonce !== 'string'
  ) {
    throw new WorkloadAuthError('MALFORMED', 'payload is missing a required field or has the wrong type')
  }
}
