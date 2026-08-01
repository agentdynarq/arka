import { test, expect } from '@playwright/test'
import { BASE_URLS } from '../playwright.config.ts'
import { currentAliceTotpCode } from './alice-totp.ts'

/**
 * Journey 1 of the two docs/TEST-STRATEGY.md names: "A customer re-verifies,
 * passes MFA, sees a balance restored from the ledger, and transfers money."
 * Screen W1 (re-verify, login, MFA, dashboard) and W3 (transfer), driven
 * through a real browser against `apps/web` and the real `apps/identity`
 * HTTP surface, backed by Cell 1's real Postgres.
 *
 * Uses the seeded demo customer from `scripts/seed.ts`: `customer:alice`,
 * transferring to `customer:bob`, an already-known payee from the seed's own
 * opening transfer, so this exercises the plain transfer path. FR-04
 * step-up on a genuinely new payee is already covered by
 * `apps/identity/test/http.integration.test.ts`; this suite's job is the
 * browser journey, not re-proving step-up's own logic.
 */
test('re-verify, MFA, dashboard balance, and a transfer to an existing payee', async ({ page }) => {
  await page.goto(`${BASE_URLS.web}/reverify`)

  await expect(page.getByRole('heading', { name: 'Re-verify your identity' })).toBeVisible()
  await page.locator('#customerId').fill('cust-alice')
  await page.locator('#registryDocumentId').fill('DOC-ALICE-001')
  await page.getByRole('button', { name: 'Continue to sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.locator('#username').fill('alice')
  await page.locator('#password').fill('demo-password-123')
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page.getByRole('heading', { name: 'Verify your identity' })).toBeVisible()
  const totpCode = await currentAliceTotpCode()
  for (const digit of totpCode) await page.keyboard.type(digit)
  await page.getByRole('button', { name: 'Verify and continue' }).click()

  await expect(page).toHaveURL(`${BASE_URLS.web}/dashboard`)
  await expect(page.getByRole('heading', { name: 'Good to see you, alice' })).toBeVisible()

  const balanceCard = page.getByTestId('balance-card').first()
  await expect(balanceCard).toBeVisible()
  const balanceBefore = await balanceCard.getByTestId('balance-amount').innerText()

  await page.getByRole('button', { name: 'Send', exact: true }).click()
  // Since the transfer screen became a full page, "Send money" titles both the page
  // header and the form panel, so an unqualified match is a strict mode violation.
  await expect(page.getByRole('heading', { name: 'Send money' }).first()).toBeVisible()
  await page.locator('#to').fill('customer:bob')
  await page.locator('#amount').fill('10.00')
  await page.getByRole('button', { name: 'Send', exact: true }).click()

  await expect(page.getByRole('heading', { name: 'Transfer confirmed' })).toBeVisible()
  await expect(page.getByText(/Ledger block #\d+, confirmed immediately\./)).toBeVisible()

  await page.getByRole('button', { name: 'Back to dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Good to see you, alice' })).toBeVisible()
  const balanceAfter = await page.getByTestId('balance-card').first().getByTestId('balance-amount').innerText()
  expect(balanceAfter).not.toEqual(balanceBefore)
})
