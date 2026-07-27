import { generateTotpSecret, totpAt, PgUserStore, PgRegistryStore } from '@arka/identity'
import type { IdentityService } from '@arka/identity'
import { databaseUrl } from './identity-provider.ts'

/**
 * Demo-mode convenience only, guarded by `NODE_ENV !== 'production'`, same
 * spirit as `reVerificationResult.livenessSimulated` being labelled rather
 * than silently faked: this exists so a reviewer without an authenticator
 * app can actually walk the FR-01 to FR-03 journey, and it says so loudly
 * rather than quietly.
 *
 * Seeds one demo customer, `alice`, aligned with lane A's `scripts/seed.ts`
 * (`customer:alice` / `cust-alice`, Cell 1), and one matching FR-01 registry
 * entry. Idempotent: reads the existing record first, rather than trying to
 * create and catching a conflict, so the printed TOTP hint is correct on
 * every restart, not only the first one.
 */
export async function bootstrapDemoData(identity: IdentityService): Promise<void> {
  if (process.env.NODE_ENV === 'production') return

  const connectionString = databaseUrl()
  const userStore = new PgUserStore(connectionString)
  const registryStore = new PgRegistryStore(connectionString)

  try {
    const demoPassword = 'demo-password-123'
    let existing = await userStore.getByUsername('alice')

    if (!existing) {
      const mfaSecret = generateTotpSecret()
      await identity.createUser({
        username: 'alice',
        password: demoPassword,
        role: 'customer',
        customerId: 'cust-alice',
        mfaSecret,
      })
      existing = await userStore.getByUsername('alice')
    }

    await registryStore.seed({
      customerId: 'cust-alice',
      registryDocumentId: 'DOC-ALICE-001',
      fullName: 'Alice Perera',
    })

    // The password itself is never printed at runtime, even though it is a fixed
    // demo constant: logging a credential on every boot is a habit worth not
    // forming, so it is documented in README.md instead, read once by a human.
    console.log('')
    console.log('[DEMO MODE] Customer "alice" ready for the W1 journey. Not real security, local testing only.')
    console.log('[DEMO MODE] Login username:      alice (password: see apps/identity/README.md)')
    console.log('[DEMO MODE] Re-verify (FR-01):   customerId "cust-alice", registryDocumentId "DOC-ALICE-001"')
    if (existing) {
      console.log(`[DEMO MODE] Current TOTP code:   ${totpAt(existing.mfaSecret)} (valid ~30s, refresh to regenerate)`)
    }
    console.log('')
  } finally {
    await userStore.close()
    await registryStore.close()
  }
}
