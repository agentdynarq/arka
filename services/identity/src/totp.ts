/**
 * TOTP (RFC 6238, built on the HOTP counter of RFC 4226). Zero runtime
 * dependencies, same rationale as `packages/ledger-core` and
 * `packages/workload-auth`: this is a small, well-specified primitive that is
 * cheaper to implement directly and read in ten minutes than to pull in for.
 *
 * 30-second step, 6 digits, SHA-1, the parameters every authenticator app
 * (Google Authenticator, Authy, 1Password) assumes when there is no explicit
 * `otpauth://` parameter negotiation. A code is checked against a small
 * window of adjacent steps to tolerate clock drift between the server and
 * whatever generated the code.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const STEP_SECONDS = 30
const DIGITS = 6
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** A fresh random secret, base32-encoded, suitable for an authenticator app's setup QR. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20))
}

/** The code valid at `time` (defaults to now). Exposed mainly for tests and the demo-mode hint. */
export function totpAt(secret: string, time: number = Date.now()): string {
  const counter = Math.floor(time / 1000 / STEP_SECONDS)
  return hotp(secret, counter)
}

/**
 * Check a submitted code against the current step and one step either side,
 * so a code generated a few seconds before or after the server's clock still
 * verifies. The comparison itself is constant-time: codes are fixed-width
 * digit strings, and a naive `===` would let a timing side channel leak how
 * many leading digits matched.
 */
export function verifyTotp(secret: string, code: string, windowSteps = 1): boolean {
  if (!/^\d{6}$/.test(code)) return false

  const counter = Math.floor(Date.now() / 1000 / STEP_SECONDS)
  for (let offset = -windowSteps; offset <= windowSteps; offset++) {
    const candidate = hotp(secret, counter + offset)
    if (constantTimeEqual(candidate, code)) return true
  }
  return false
}

function hotp(secret: string, counter: number): string {
  const key = base32Decode(secret)
  const counterBytes = Buffer.alloc(8)
  counterBytes.writeBigUInt64BE(BigInt(counter))

  const digest = createHmac('sha1', key).update(counterBytes).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)

  const code = (binary % 10 ** DIGITS).toString().padStart(DIGITS, '0')
  return code
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

function base32Encode(bytes: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 0x1f]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f]
  }
  return output
}

function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char)
    if (index === -1) continue
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}
