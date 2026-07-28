// Real login against the real running apps/identity, avoiding the TOTP
// timing race a human typing curl commands would hit: reads alice's mfaSecret
// directly from Postgres and computes the current code, same trick used
// earlier this session, so the recorded demo never fails on an expired code.
import { PgUserStore, totpAt } from '@arka/identity'

const IDENTITY_URL = 'http://127.0.0.1:3001'

const store = new PgUserStore('postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1')
const user = await store.getByUsername('alice')
await store.close()

const login = await fetch(`${IDENTITY_URL}/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'alice', password: 'demo-password-123' }),
}).then((r) => r.json())

const mfa = await fetch(`${IDENTITY_URL}/v1/auth/mfa/verify`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mfaToken: login.mfaToken, totpCode: totpAt(user.mfaSecret) }),
}).then((r) => r.json())

const { writeFileSync } = await import('node:fs')
writeFileSync(new URL('.token', import.meta.url), mfa.accessToken)
console.log('signed in as alice')
