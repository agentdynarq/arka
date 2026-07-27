/**
 * Password hashing. Argon2id via `@node-rs/argon2` (native binding, no pure-JS
 * fallback to get subtly wrong). A password never appears in a log line, in
 * an error message, or in anything this module returns: `hashPassword`
 * returns only the encoded hash, and a caller holding a `UserStore` record
 * never sees the plaintext again once this module has touched it.
 *
 * Verification uses the library's own `verify`, not a manual hash-then-equals
 * comparison, so an incorrect password is rejected without a code path that
 * could be tempted to compare in variable time.
 */
import { hash, verify } from '@node-rs/argon2'

/** Encode a plaintext password. The result is the only thing safe to store. */
export async function hashPassword(plaintext: string): Promise<string> {
  return hash(plaintext)
}

/**
 * Check a plaintext password against a stored hash.
 *
 * Returns `false` rather than throwing for a malformed or foreign hash
 * (for example, one produced by a different scheme), so a corrupt record
 * fails a login instead of crashing the request.
 */
export async function verifyPassword(encodedHash: string, plaintext: string): Promise<boolean> {
  try {
    return await verify(encodedHash, plaintext)
  } catch {
    return false
  }
}
