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
import { PaymentsService, PgIdempotencyStore, PgLimitsStore, PgAgentCashStore, PgQrRedemptionStore } from '@arka/payments'
import { NotificationsService, PgNotificationStore } from '@arka/notifications'
import { HttpQuarantineChecker } from './recovery/quarantine-checker.ts'
import type { QuarantineChecker } from './recovery/quarantine-checker.ts'

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
  readonly ledger: LedgerService
  readonly payments: PaymentsService
  readonly notifications: NotificationsService
  readonly quarantineChecker: QuarantineChecker
}

let built: Built | null = null

/**
 * The one instance of each service for this Cell, composed together in a
 * single process. See docs/adr/0006 for why: Identity, Accounts, Ledger,
 * Payments and Notifications are separate, independently-testable packages,
 * this is only where they run for Phase 2. Built from real Postgres-backed
 * stores, constructed exactly once, and handed out from the same cache
 * rather than each caller building its own copy.
 */
function build(): Built {
  if (built) return built

  const connectionString = databaseUrl()
  const cellId = process.env.CELL_ID ?? 'cell-1'

  const ledger = new LedgerService(new PgLedgerStore(connectionString), { cellId })
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

  const payments = new PaymentsService({
    accounts,
    ledger,
    idempotency: new PgIdempotencyStore(connectionString),
    limits: new PgLimitsStore(connectionString),
    agentCash: new PgAgentCashStore(connectionString),
    qrRedemptions: new PgQrRedemptionStore(connectionString),
    qrSigningKey: process.env.QR_SIGNING_KEY ?? 'dev-only-qr-signing-key-not-for-production',
  })

  const notifications = new NotificationsService({ store: new PgNotificationStore(connectionString) })

  const quarantineChecker = new HttpQuarantineChecker({
    recoveryUrl: process.env.RECOVERY_URL ?? 'http://localhost:3002',
  })

  built = { identity, accounts, ledger, payments, notifications, quarantineChecker }
  return built
}

export function buildIdentityService(): IdentityService {
  return build().identity
}

export function buildAccountsService(): AccountsService {
  return build().accounts
}

export function buildLedgerService(): LedgerService {
  return build().ledger
}

export function buildPaymentsService(): PaymentsService {
  return build().payments
}

export function buildNotificationsService(): NotificationsService {
  return build().notifications
}

export function buildQuarantineChecker(): QuarantineChecker {
  return build().quarantineChecker
}
