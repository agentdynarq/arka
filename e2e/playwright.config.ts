import { defineConfig } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const APPS = join(HERE, '..', 'apps')

/** Overridable per environment: some sandboxes reserve arbitrary high ports. */
const PORTS = {
  web: Number(process.env.E2E_WEB_PORT ?? 3100),
  identity: Number(process.env.E2E_IDENTITY_PORT ?? 3101),
  recovery: Number(process.env.E2E_RECOVERY_PORT ?? 3102),
  gateway: Number(process.env.E2E_GATEWAY_PORT ?? 3103),
  console: Number(process.env.E2E_CONSOLE_PORT ?? 3300),
}

export const BASE_URLS = {
  web: `http://localhost:${PORTS.web}`,
  identity: `http://localhost:${PORTS.identity}`,
  recovery: `http://localhost:${PORTS.recovery}`,
  gateway: `http://localhost:${PORTS.gateway}`,
  console: `http://localhost:${PORTS.console}`,
}

/**
 * Every app process this suite needs, built fresh and started once for the
 * whole run. `reuseExistingServer` outside CI so a developer who already has
 * `pnpm dev` running locally does not pay for a second boot. Every one of
 * these assumes `docker compose up` has already brought up the three
 * Postgres databases and two Redis instances; this config does not manage
 * Docker itself, same division as every other script in this repo.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  globalSetup: join(HERE, 'global-setup.ts'),
  webServer: [
    {
      command: 'pnpm run build && pnpm run start',
      cwd: join(APPS, 'identity'),
      url: `${BASE_URLS.identity}/healthz`,
      // FR-22's QuarantineGuard asks apps/recovery directly and fails closed
      // if it cannot reach it; without this, every write here 503s, since the
      // default RECOVERY_URL (:3002) is not where this suite's own recovery
      // instance listens.
      env: { IDENTITY_PORT: String(PORTS.identity), RECOVERY_URL: BASE_URLS.recovery },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm run build && pnpm run start',
      cwd: join(APPS, 'recovery'),
      url: `${BASE_URLS.recovery}/healthz`,
      env: { RECOVERY_PORT: String(PORTS.recovery) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm run build && pnpm run start',
      cwd: join(APPS, 'gateway'),
      url: `${BASE_URLS.gateway}/healthz`,
      env: { GATEWAY_PORT: String(PORTS.gateway) },
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm run build && pnpm run start',
      cwd: join(APPS, 'web'),
      url: BASE_URLS.web,
      env: { PORT: String(PORTS.web), NEXT_PUBLIC_IDENTITY_API_URL: BASE_URLS.identity },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
    {
      // Console's own start script fixes -p 3300; started directly here instead
      // so this suite's port is independently overridable (see PORTS above).
      command: `pnpm run build && npx next start -p ${PORTS.console}`,
      cwd: join(APPS, 'console'),
      url: BASE_URLS.console,
      env: { NEXT_PUBLIC_RECOVERY_API_URL: BASE_URLS.recovery },
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
})
