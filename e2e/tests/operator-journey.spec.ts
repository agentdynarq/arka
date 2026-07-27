import { test, expect } from '@playwright/test'
import { BASE_URLS } from '../playwright.config.ts'

/**
 * Journey 2 of the two docs/TEST-STRATEGY.md names: "An operator sees a
 * degraded Cell, quarantines it under dual approval, and the other Cell
 * keeps serving." Screen W5, driven through a real browser with two
 * separate browser contexts standing in for two separate operators, per
 * `docs/RUNBOOK.md` P2's own demonstration note ("show a second browser").
 *
 * "The other Cell keeps serving" is checked the same way the 29 July log
 * verified it manually: through `apps/gateway`'s write-check endpoint, since
 * that is the actual enforcement point (`docs/ARCHITECTURE.md` section 1),
 * not a browser screen of its own.
 */
test('quarantine under dual approval, and the other Cell keeps serving', async ({ browser, request }) => {
  const operator1 = await browser.newContext()
  const operator2 = await browser.newContext()
  const page1 = await operator1.newPage()
  const page2 = await operator2.newPage()

  try {
    await page1.goto(`${BASE_URLS.console}/health-map`)
    const cell1Card = page1.getByTestId('cell-card').filter({ hasText: 'cell-1' })
    await expect(cell1Card.getByTestId('cell-status')).toHaveText('healthy')

    await page1.getByLabel('Acting as operator id').fill('operator-1')
    await cell1Card.getByLabel('Reason').fill('anomalous write volume, e2e drill')
    await cell1Card.getByRole('button', { name: 'Request quarantine' }).click()
    await expect(cell1Card.getByText(/Pending quarantine/)).toBeVisible()

    await page2.goto(`${BASE_URLS.console}/health-map`)
    const cell1CardOnPage2 = page2.getByTestId('cell-card').filter({ hasText: 'cell-1' })
    await page2.getByLabel('Acting as operator id').fill('operator-2')
    await expect(cell1CardOnPage2.getByRole('button', { name: 'Approve quarantine' })).toBeVisible()
    await cell1CardOnPage2.getByRole('button', { name: 'Approve quarantine' }).click()
    await expect(cell1CardOnPage2.getByTestId('cell-status')).toHaveText('quarantined')

    await page1.reload()
    const cell1CardAfter = page1.getByTestId('cell-card').filter({ hasText: 'cell-1' })
    const cell2CardAfter = page1.getByTestId('cell-card').filter({ hasText: 'cell-2' })
    await expect(cell1CardAfter.getByTestId('cell-status')).toHaveText('quarantined')
    await expect(cell2CardAfter.getByTestId('cell-status')).toHaveText('healthy')

    // `.last()`: the audit trail is append-only and may already carry entries
    // from earlier runs, so this checks the most recent matching row rather
    // than requiring there be exactly one.
    const trailRows = page1.getByTestId('audit-trail').locator('tbody tr')
    await expect(trailRows.filter({ hasText: 'quarantine.requested' }).last()).toBeVisible()
    await expect(trailRows.filter({ hasText: 'quarantine.approved' }).last()).toBeVisible()

    // Find one customer id the gateway's stable hash routes to cell-1 and one to cell-2.
    let cell1CustomerId: string | undefined
    let cell2CustomerId: string | undefined
    for (let i = 0; i < 20 && (!cell1CustomerId || !cell2CustomerId); i++) {
      const customerId = `customer:e2e-probe-${i}`
      const routed = await (await request.get(`${BASE_URLS.gateway}/v1/cell-router/${customerId}`)).json()
      if (routed.cellId === 'cell-1') cell1CustomerId ??= customerId
      if (routed.cellId === 'cell-2') cell2CustomerId ??= customerId
    }
    expect(cell1CustomerId, 'expected at least one probe customer id to route to cell-1').toBeTruthy()
    expect(cell2CustomerId, 'expected at least one probe customer id to route to cell-2').toBeTruthy()

    const quarantinedWrite = await request.get(`${BASE_URLS.gateway}/v1/cell-router/${cell1CustomerId}/write-check`)
    expect(quarantinedWrite.status()).toBe(403)
    expect((await quarantinedWrite.json()).code).toBe('CELL_QUARANTINED')

    const quarantinedRead = await request.get(`${BASE_URLS.gateway}/v1/cell-router/${cell1CustomerId}`)
    expect(quarantinedRead.status()).toBe(200)

    const otherCellWrite = await request.get(`${BASE_URLS.gateway}/v1/cell-router/${cell2CustomerId}/write-check`)
    expect(otherCellWrite.status()).toBe(200)

    // Restore state under dual approval too, so a repeat run starts from the same place.
    // page1's operatorId reset to its default, 'operator-1', on reload above.
    await cell1CardAfter.getByRole('button', { name: 'Request lift' }).click()
    await page2.reload()
    await page2.getByLabel('Acting as operator id').fill('operator-2')
    await cell1CardOnPage2.getByRole('button', { name: 'Approve lift' }).click()
    await expect(cell1CardOnPage2.getByTestId('cell-status')).toHaveText('healthy')
  } finally {
    await operator1.close()
    await operator2.close()
  }
})

test('screen W6: integrity verification reports a clean chain for Cell 1', async ({ page }) => {
  await page.goto(`${BASE_URLS.console}/integrity`)
  await expect(page.getByTestId('cell-card').first()).toBeVisible()

  await page.getByRole('button', { name: 'Run verification' }).click()
  await expect(page.getByRole('heading', { name: /Evidence: cell-/ })).toBeVisible()
  await expect(page.getByTestId('evidence-status')).toHaveText('clean')
  await expect(page.getByRole('link', { name: 'Export evidence' })).toBeVisible()
})
