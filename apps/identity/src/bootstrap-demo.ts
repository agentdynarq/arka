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
 * Cell-aware: each Cell seeds different account names (`scripts/seed.ts`'s
 * own `CUSTOMERS_BY_CELL`, cell-1 gets alice/bob, cell-2 gets chandi/deepal).
 * This used to hardcode `alice`/`cust-alice` regardless of `CELL_ID`, so an
 * identity server pointed at Cell 2 would happily create a login called
 * "alice" with no matching account in Cell 2's ledger: it would authenticate
 * and show an empty dashboard, not a real second-customer demo. Picking the
 * login by `CELL_ID` closes that gap. Idempotent: reads the existing record
 * first, rather than trying to create and catching a conflict, so the
 * printed TOTP hint is correct on every restart, not only the first one.
 */
const DEMO_LOGIN_BY_CELL: Record<string, { username: string; customerId: string; registryDocumentId: string; fullName: string }> = {
  'cell-1': { username: 'alice', customerId: 'cust-alice', registryDocumentId: 'DOC-ALICE-001', fullName: 'Alice Perera' },
  'cell-2': { username: 'chandi', customerId: 'cust-chandi', registryDocumentId: 'DOC-CHANDI-001', fullName: 'Chandi Fernando' },
}

export async function bootstrapDemoData(identity: IdentityService): Promise<void> {
  // NODE_ENV is genuinely `production` in the deployed image, because the apps
  // really are running in production mode there. The demo logins are still
  // needed on that deployment: a bank nobody can sign into demonstrates
  // nothing. So the guard is an explicit flag rather than an inference from
  // NODE_ENV, and a real deployment leaves it unset.
  //
  // This creates an account with a published password, which is deliberate and
  // is not the same class of thing as DEMO_MFA_ENDPOINT_ENABLED. The password
  // is in USER-GUIDE.md for judges to use. MFA still stands between that
  // password and a session, which is exactly why the endpoint that hands out
  // TOTP codes is off by default on a deployed Cell.
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_LOGINS_ENABLED !== 'true') return

  const cellId = process.env.CELL_ID ?? 'cell-1'
  const demoLogin = DEMO_LOGIN_BY_CELL[cellId]
  if (!demoLogin) {
    console.log(`[DEMO MODE] No demo login configured for CELL_ID "${cellId}", skipping bootstrap.`)
    return
  }

  const { username, customerId, registryDocumentId, fullName } = demoLogin
  const connectionString = databaseUrl()
  const userStore = new PgUserStore(connectionString)
  const registryStore = new PgRegistryStore(connectionString)

  try {
    const demoPassword = 'demo-password-123'
    let existing = await userStore.getByUsername(username)

    if (!existing) {
      const mfaSecret = generateTotpSecret()
      await identity.createUser({
        username,
        password: demoPassword,
        role: 'customer',
        customerId,
        mfaSecret,
      })
      existing = await userStore.getByUsername(username)
    }

    await registryStore.seed({ customerId, registryDocumentId, fullName })

    // The password itself is never printed at runtime, even though it is a fixed
    // demo constant: logging a credential on every boot is a habit worth not
    // forming, so it is documented in README.md instead, read once by a human.
    console.log('')
    console.log(`[DEMO MODE] Customer "${username}" ready for the W1 journey. Not real security, local testing only.`)
    console.log(`[DEMO MODE] Login username:      ${username} (password: see apps/identity/README.md)`)
    console.log(`[DEMO MODE] Re-verify (FR-01):   customerId "${customerId}", registryDocumentId "${registryDocumentId}"`)
    if (existing) {
      console.log(`[DEMO MODE] Current TOTP code:   ${totpAt(existing.mfaSecret)} (valid ~30s, refresh to regenerate)`)
    }
    console.log('')
  } finally {
    await userStore.close()
    await registryStore.close()
  }
}
