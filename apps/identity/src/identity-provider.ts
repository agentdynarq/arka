import { LedgerService, PgLedgerStore } from '@arka/ledger'
import { AccountsService, PgAccountRegistry } from '@arka/accounts'
import {
  IdentityService,
  PgUserStore,
  PgSessionStore,
  PgRateLimiter,
  PgRegistryStore,
  PgKycDocumentStore,
  PgAccountOpeningStore,
} from '@arka/identity'

/**
 * `DATABASE_URL` is the name `docs/ARCHITECTURE.md` section 3 already gives
 * this: "a Cell is that service deployed with a different ... `DATABASE_URL`".
 * Falls back to Cell 1's local `docker compose` port so `pnpm --filter
 * @arka/identity-app dev` works with no configuration for a first run.
 */
export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'
}

interface Built {
  readonly identity: IdentityService
  readonly accounts: AccountsService
}

let built: Built | null = null

/**
 * The one `IdentityService` and `AccountsService` for this Cell, built from
 * real Postgres-backed stores and constructed exactly once. `IdentityService`
 * composes `AccountsService` for FR-02 provisioning; the dashboard endpoint
 * also needs `AccountsService` directly to read a real balance, so both are
 * built together here and handed out from the same cache rather than each
 * building its own, separate `AccountsService`.
 */
function build(): Built {
  if (built) return built

  const connectionString = databaseUrl()
  const ledger = new LedgerService(new PgLedgerStore(connectionString), { cellId: process.env.CELL_ID ?? 'cell-1' })
  const accounts = new AccountsService({ registry: new PgAccountRegistry(connectionString), ledger })

  const identity = new IdentityService({
    userStore: new PgUserStore(connectionString),
    sessionStore: new PgSessionStore(connectionString),
    rateLimiter: new PgRateLimiter(connectionString),
    registryStore: new PgRegistryStore(connectionString),
    kycStore: new PgKycDocumentStore(connectionString),
    accountOpenings: new PgAccountOpeningStore(connectionString),
    accounts,
  })

  built = { identity, accounts }
  return built
}

export function buildIdentityService(): IdentityService {
  return build().identity
}

export function buildAccountsService(): AccountsService {
  return build().accounts
}
