import { createHmac, timingSafeEqual } from 'node:crypto'
import { PaymentsError } from './types.ts'
import type { QrPaymentPayload, SignedQrPayload } from './types.ts'

/**
 * Sign and verify FR-11 QR payment payloads.
 *
 * Stateless and zero runtime dependencies, same reasoning as
 * `@arka/workload-auth`: this is a small, security-sensitive surface, so a
 * smaller audit surface matters more than a standard token format. The
 * signature covers the raw encoded fields; it is checked before anything is
 * parsed back into a shape and trusted, the same discipline
 * `verifyWorkloadToken` uses.
 *
 * The canonical form is JSON, not a hand-joined delimited string. A
 * delimiter would have to be a character none of merchantAccountId,
 * amount, or reference could ever contain, and getting that wrong (as an
 * earlier draft of this file did) silently produces an unparseable or
 * ambiguous token instead of a loud error.
 */

interface Canonical {
  readonly m: string
  readonly a: string
  readonly r: string
  readonly e: string
}

function canonicalise(payload: QrPaymentPayload): string {
  const fields: Canonical = {
    m: payload.merchantAccountId,
    a: payload.amount.toString(),
    r: payload.reference,
    e: payload.expiresAt,
  }
  return JSON.stringify(fields)
}

function sign(canonical: string, signingKey: string): string {
  return createHmac('sha256', signingKey).update(canonical, 'utf8').digest('base64url')
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Produce the opaque token a QR code encodes: the payload plus its signature, base64url-joined. */
export function signQrPayload(payload: QrPaymentPayload, signingKey: string): SignedQrPayload {
  const canonical = canonicalise(payload)
  const signature = sign(canonical, signingKey)
  const token = Buffer.from(canonical, 'utf8').toString('base64url') + '.' + signature
  return { token, payload }
}

/**
 * Verify a scanned token and recover its payload.
 *
 * Throws rather than returning null on any failure, so a caller cannot
 * accidentally treat an unverified token as valid by forgetting a null
 * check. `QR_EXPIRED` is distinguished from `QR_SIGNATURE_INVALID` so a
 * customer sees "this QR code has expired" rather than "invalid code" for
 * the common, non-adversarial case of a stale code.
 */
export function verifyQrPayload(
  token: string,
  signingKey: string,
  now: () => Date = () => new Date()
): QrPaymentPayload {
  const parts = token.split('.')
  if (parts.length !== 2) {
    throw new PaymentsError('QR_MALFORMED', 'a QR token has exactly two parts')
  }
  const [encodedCanonical, signature] = parts as [string, string]

  let canonical: string
  try {
    canonical = Buffer.from(encodedCanonical, 'base64url').toString('utf8')
  } catch {
    throw new PaymentsError('QR_MALFORMED', 'QR token is not valid base64url')
  }

  const expectedSignature = sign(canonical, signingKey)
  if (!constantTimeEqual(signature, expectedSignature)) {
    throw new PaymentsError('QR_SIGNATURE_INVALID', 'QR token signature does not match')
  }

  let fields: Canonical
  try {
    fields = JSON.parse(canonical) as Canonical
  } catch {
    throw new PaymentsError('QR_MALFORMED', 'QR token payload is not valid JSON')
  }
  if (
    typeof fields.m !== 'string' ||
    typeof fields.a !== 'string' ||
    typeof fields.r !== 'string' ||
    typeof fields.e !== 'string'
  ) {
    throw new PaymentsError('QR_MALFORMED', 'QR token payload is missing a required field')
  }

  let amount: bigint
  try {
    amount = BigInt(fields.a)
  } catch {
    throw new PaymentsError('QR_MALFORMED', 'QR token amount is not a valid integer')
  }
  if (amount <= 0n) {
    throw new PaymentsError('QR_MALFORMED', 'QR token amount must be positive')
  }

  if (Date.parse(fields.e) <= now().getTime()) {
    throw new PaymentsError('QR_EXPIRED', `QR code expired at ${fields.e}`)
  }

  return { merchantAccountId: fields.m, amount, reference: fields.r, expiresAt: fields.e }
}
