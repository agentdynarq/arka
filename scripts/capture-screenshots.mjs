#!/usr/bin/env node
/**
 * Drives a real browser (Playwright's bundled Chromium, launched fresh, no
 * extensions, no dev indicator since the stack is served via `pnpm build &&
 * pnpm start`) through the five states scripts/capture-setup.sh prepares,
 * and screenshots each one at the final filename Lane B builds layout
 * against.
 *
 * Assumes: docker compose up, the stack built and started (identity :3001,
 * recovery :3002, gateway :8080, web :3000, console :3300), and the demo
 * seed in place. Calls capture-setup.sh itself for the backend state each
 * screenshot needs, so this is the single entry point for a capture pass.
 *
 * Usage:
 *   npm --prefix scripts install     once, this directory sits outside the pnpm
 *                                    workspace so it carries its own dependency
 *   node scripts/capture-screenshots.mjs
 *
 * WEB_URL, CONSOLE_URL and IDENTITY_URL override the defaults when another lane
 * already holds :3000 or :3300 on the same machine.
 */
import { chromium, expect } from 'playwright/test'
import { mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)
const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..')
const OUT_DIR = join(REPO_ROOT, 'apps/web/public/media')

// Overridable because another lane may already hold the default ports on a shared
// machine, and a capture pass must never require killing their server to run.
const WEB = process.env.WEB_URL ?? 'http://127.0.0.1:3000'
const CONSOLE = process.env.CONSOLE_URL ?? 'http://127.0.0.1:3300'
const VIEWPORT = { width: 1440, height: 900 }
const DEVICE_SCALE_FACTOR = 2

const ALICE_USERNAME = 'alice'
const ALICE_PASSWORD = 'demo-password-123'
const ALICE_CUSTOMER_ID = 'cust-alice'
const ALICE_REGISTRY_DOC = 'DOC-ALICE-001'
const IDENTITY_URL = process.env.IDENTITY_URL ?? 'http://127.0.0.1:3001'

async function captureSetup(mode) {
  console.log(`  capture-setup.sh ${mode}`)
  await run('bash', [join(HERE, 'capture-setup.sh'), mode], { cwd: REPO_ROOT })
}

async function currentAliceTotpCode() {
  const response = await fetch(`${IDENTITY_URL}/v1/auth/demo/mfa-code?username=${ALICE_USERNAME}`)
  if (!response.ok) throw new Error(`demo mfa code endpoint returned ${response.status}`)
  const body = await response.json()
  return body.code
}

/** Drives /reverify through to the MFA step, leaving the code unentered. */
async function reachMfaStep(page) {
  await page.goto(`${WEB}/reverify`)
  await page.locator('#customerId').fill(ALICE_CUSTOMER_ID)
  await page.locator('#registryDocumentId').fill(ALICE_REGISTRY_DOC)
  await page.getByRole('button', { name: 'Continue to sign in' }).click()

  await page.getByRole('heading', { name: 'Sign in' }).waitFor()
  await page.locator('#username').fill(ALICE_USERNAME)
  await page.locator('#password').fill(ALICE_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await page.getByRole('heading', { name: 'Verify your identity' }).waitFor()
}

async function completeMfa(page) {
  const totpCode = await currentAliceTotpCode()
  for (const digit of totpCode) await page.keyboard.type(digit)
  await page.getByRole('button', { name: 'Verify and continue' }).click()
  await page.waitForURL(`${WEB}/dashboard`)
  await page.getByRole('heading', { name: 'Good to see you, alice' }).waitFor()
}

async function shot(page, filename) {
  const path = join(OUT_DIR, filename)
  await page.screenshot({ path })
  console.log(`  wrote ${filename}`)
}

async function captureDashboardAndTransfer(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR })
  const page = await context.newPage()
  try {
    console.log('[a] customer dashboard')
    await reachMfaStep(page)
    await completeMfa(page)
    await page.waitForTimeout(500)
    await shot(page, '01-customer-dashboard.png')

    console.log('[b] transfer mid step-up')
    // Since Lane C's rebuild, Send routes to /transfer as a full page rather than
    // opening a modal, and "Send money" is the title of both the PageHeader and the
    // form Panel, so the heading match has to be first() to stay out of strict mode.
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    await page.waitForURL(`${WEB}/transfer`)
    await page.getByRole('heading', { name: 'Send money' }).first().waitFor()
    // A payee alice has never paid, so FR-04's new-payee step-up actually triggers.
    await page.locator('#to').fill('merchant:helas-hardware')
    await page.locator('#amount').fill('1500.00')
    await page.getByRole('button', { name: 'Send', exact: true }).click()
    // Only the form Panel takes this title, so it stays unambiguous.
    await page.getByRole('heading', { name: "Confirm it's you" }).waitFor()
    await page.waitForTimeout(300)
    await shot(page, '02-transfer-step-up.png')
  } finally {
    await context.close()
  }
}

async function captureMfaWidget(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR })
  const page = await context.newPage()
  try {
    console.log('[e] MFA demo widget')
    await reachMfaStep(page)
    await page.getByRole('button', { name: 'Check your phone for the code' }).click()
    await page.getByTestId('demo-mfa-code').waitFor()
    await page.waitForTimeout(300)
    await shot(page, '05-mfa-widget.png')
  } finally {
    await context.close()
  }
}

async function captureIntegrityAudit(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR })
  const page = await context.newPage()
  try {
    console.log('[d] console integrity audit')
    await page.goto(`${CONSOLE}/integrity`)
    await page.getByTestId('cell-card').first().waitFor()
    // The button stays disabled until the Cell overview resolves and populates the
    // Cell select, so wait for it to go enabled rather than racing the fetch.
    const runVerification = page.getByRole('button', { name: 'Run verification' })
    await runVerification.waitFor()
    await expect(runVerification).toBeEnabled()
    await runVerification.click()
    await page.getByRole('heading', { name: /Evidence: cell-/ }).waitFor()
    await page.getByTestId('evidence-status').first().waitFor()
    await page.waitForTimeout(300)
    await shot(page, '04-console-integrity-audit.png')
  } finally {
    await context.close()
  }
}

async function captureHealthMapPending(browser) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR })
  const page = await context.newPage()
  try {
    console.log('[c] console health map, cell-1 pending second approval')
    await captureSetup('quarantine-pending')
    await page.goto(`${CONSOLE}/health-map`)
    const cell1Card = page.getByTestId('cell-card').filter({ hasText: 'cell-1' })
    await cell1Card.waitFor()
    // Wait for the pending banner itself, not just the card. The health rows and the
    // quarantine state arrive on separate fetches, so the card can paint a frame
    // before the state does, and the whole point of this shot is that banner.
    await cell1Card.getByText(/awaiting second approval/i).waitFor()
    await page.waitForTimeout(300)
    await shot(page, '03-console-health-map.png')
  } finally {
    await context.close()
    await captureSetup('restore')
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  await captureSetup('baseline')

  const browser = await chromium.launch()
  try {
    await captureDashboardAndTransfer(browser)
    await captureMfaWidget(browser)
    await captureIntegrityAudit(browser)
    await captureHealthMapPending(browser)
  } finally {
    await browser.close()
  }

  console.log('done. Five PNGs written to apps/web/public/media/.')
}

main().catch((error) => {
  console.error('capture-screenshots failed:', error)
  process.exit(1)
})
