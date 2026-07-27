import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Deterministic demo data (`scripts/seed.ts`), idempotent: a Cell that is
 * already seeded is left alone, so re-running this suite twice against the
 * same stack does not double the seed transfer. Only needs Postgres, which
 * `docker compose up` already provides before this suite runs; it does not
 * depend on any of the app servers `playwright.config.ts` starts.
 */
export default function globalSetup(): void {
  const result = spawnSync('pnpm', ['seed'], { cwd: REPO_ROOT, stdio: 'inherit', shell: true })
  if (result.status !== 0) {
    throw new Error('pnpm seed failed; the e2e suite needs deterministic demo data first')
  }
}
