import { PgUserStore, totpAt } from '@arka/identity'

/**
 * Cell 1's own connection string, same default `apps/identity/src/identity-provider.ts`
 * falls back to. Reads the demo user's real, randomly generated MFA secret
 * directly from Postgres and computes a live code from it, exactly what
 * `apps/identity/src/bootstrap-demo.ts` does for its own console hint: never
 * a hardcoded code, since the secret is fresh per environment.
 */
const CELL1_CONNECTION_STRING =
  process.env.CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

export async function currentAliceTotpCode(): Promise<string> {
  const store = new PgUserStore(CELL1_CONNECTION_STRING)
  try {
    const alice = await store.getByUsername('alice')
    if (!alice) {
      throw new Error('Demo user "alice" not found in Cell 1. Did the identity server boot and bootstrap demo data?')
    }
    return totpAt(alice.mfaSecret)
  } finally {
    await store.close()
  }
}
