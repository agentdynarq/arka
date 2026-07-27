/**
 * Encoding helpers. `canonicalJson` sorts keys so that issuing the same
 * logical header or payload twice always produces the same bytes to sign,
 * the same discipline ledger-core applies to its canonical form.
 */

export function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

export function base64UrlDecodeToString(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8')
}

export function canonicalJson(value: object): string {
  const record = value as Record<string, unknown>
  const ordered: Record<string, unknown> = {}
  for (const key of Object.keys(record).sort()) {
    ordered[key] = record[key]
  }
  return JSON.stringify(ordered)
}
