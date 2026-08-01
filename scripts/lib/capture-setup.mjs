#!/usr/bin/env node
/**
 * Drives the running stack via its real HTTP APIs into the backend state
 * each capture screenshot needs. Never fabricates a response: every check
 * here is a genuine fetch() against the running identity/recovery apps,
 * same discipline as docs/media/record.mjs.
 *
 * Usage (see ../capture-setup.sh for the entry point):
 *   node capture-setup.mjs baseline              cell-1 healthy, seed and MFA demo endpoint verified
 *   node capture-setup.mjs quarantine-pending     cell-1 into pending_second_approval (operator-priya only)
 *   node capture-setup.mjs restore                lift any quarantine, back to healthy
 *
 * All three are idempotent: safe to run from a clean boot, and safe to
 * re-run after a previous run left the Cell in any of the three quarantine
 * states (none, pending_second_approval, quarantined).
 */
const IDENTITY_URL = process.env.IDENTITY_URL ?? 'http://localhost:3001'
const RECOVERY_URL = process.env.RECOVERY_URL ?? 'http://localhost:3002'

const CELL_ID = 'cell-1'
const REQUESTER = 'operator-priya'
const APPROVER = 'operator-nadeesha'
const DEMO_REASON = 'suspected compromise, demo (media capture)'

const ALICE_USERNAME = 'alice'
const ALICE_PASSWORD = 'demo-password-123'

async function json(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  const text = await response.text()
  const body = text.length > 0 ? JSON.parse(text) : null
  if (!response.ok) {
    const detail = body?.code ?? body?.message ?? response.statusText
    throw new Error(`${init?.method ?? 'GET'} ${url} -> ${response.status} ${detail}`)
  }
  return body
}

async function quarantineStatus(cellId) {
  return json(`${RECOVERY_URL}/v1/recovery/quarantine/${cellId}`)
}

async function requestQuarantine(cellId) {
  return json(`${RECOVERY_URL}/v1/recovery/quarantine/request`, {
    method: 'POST',
    body: JSON.stringify({ cellId, reason: DEMO_REASON, requestedBy: REQUESTER }),
  })
}

async function approveQuarantine(cellId, approvedBy) {
  return json(`${RECOVERY_URL}/v1/recovery/quarantine/approve`, {
    method: 'POST',
    body: JSON.stringify({ cellId, approvedBy }),
  })
}

async function requestLift(cellId, requestedBy) {
  return json(`${RECOVERY_URL}/v1/recovery/quarantine/lift/request`, {
    method: 'POST',
    body: JSON.stringify({ cellId, requestedBy }),
  })
}

async function approveLift(cellId, approvedBy) {
  return json(`${RECOVERY_URL}/v1/recovery/quarantine/lift/approve`, {
    method: 'POST',
    body: JSON.stringify({ cellId, approvedBy }),
  })
}

/**
 * Bring a Cell back to `none` regardless of which of the three quarantine
 * states it is currently in. The wire status does not expose `direction`
 * (see services/recovery/src/quarantine-store.ts), so a `pending_second_approval`
 * is resolved by trying it as a pending lift first (the common case, since
 * this script is the only thing that ever quarantines a Cell for a demo) and
 * falling back to finishing a pending quarantine and then lifting it.
 */
async function ensureHealthy(cellId) {
  let status = await quarantineStatus(cellId)

  if (status.state === 'pending_second_approval') {
    try {
      status = await approveLift(cellId, APPROVER)
    } catch {
      status = await approveQuarantine(cellId, APPROVER)
    }
  }

  if (status.state === 'quarantined') {
    await requestLift(cellId, REQUESTER)
    status = await approveLift(cellId, APPROVER)
  }

  if (status.state !== 'none') {
    throw new Error(`${cellId}: expected healthy ('none'), still '${status.state}'`)
  }
  return status
}

async function ensureQuarantinePending(cellId) {
  // Every Cell, so the one pending banner in the frame is the one this puts there.
  await ensureAllHealthy()
  const status = await requestQuarantine(cellId)
  if (status.state !== 'pending_second_approval') {
    throw new Error(`${cellId}: expected pending_second_approval, got '${status.state}'`)
  }
  if (!status.approvedBy.includes(REQUESTER) || status.approvedBy.includes(APPROVER)) {
    throw new Error(`${cellId}: unexpected approvedBy ${JSON.stringify(status.approvedBy)}`)
  }
  return status
}

async function checkHealthMap() {
  const snapshot = await json(`${RECOVERY_URL}/v1/recovery/health-map`)
  const cell1 = snapshot.find((c) => c.cellId === CELL_ID)
  console.log(`  health-map: ${JSON.stringify(snapshot.map((c) => `${c.cellId}=${c.status}`))}`)
  return cell1
}

async function allCellIds() {
  const snapshot = await json(`${RECOVERY_URL}/v1/recovery/health-map`)
  return snapshot.map((c) => c.cellId)
}

/**
 * Normalise every Cell to `none`, not just cell-1. Screenshot (c) is meant to
 * show exactly one Cell awaiting a second approval, and a pending quarantine
 * that an earlier session left on cell-2 otherwise survives into the frame and
 * reads as leftover test state, with "Pending approvals" counting 2.
 */
async function ensureAllHealthy() {
  for (const cellId of await allCellIds()) await ensureHealthy(cellId)
}

async function checkIntegrityClean(cellId) {
  const evidence = await json(`${RECOVERY_URL}/v1/recovery/integrity/${cellId}`)
  console.log(`  integrity ${cellId}: ${evidence.result.ok ? 'clean' : 'BROKEN'}, ${evidence.result.records} records`)
  if (!evidence.result.ok) {
    throw new Error(`${cellId}: integrity check is not clean, screenshot (d) would show a broken result`)
  }
  return evidence
}

async function checkDemoMfaCode(username) {
  const response = await fetch(`${IDENTITY_URL}/v1/auth/demo/mfa-code?username=${username}`)
  if (response.status === 404) {
    throw new Error(
      'GET /v1/auth/demo/mfa-code -> 404. Set DEMO_MFA_ENDPOINT_ENABLED=true in .env before booting identity (needed for screenshot e).'
    )
  }
  const body = await response.json()
  console.log(`  demo mfa code for ${username}: ${body.code} (expires in ${body.expiresInSeconds}s)`)
  return body
}

/** Full login through to a real dashboard read, proving the reseed is live end to end. */
async function checkAliceDashboard() {
  const challenge = await json(`${IDENTITY_URL}/v1/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ username: ALICE_USERNAME, password: ALICE_PASSWORD }),
  })
  const { code } = await checkDemoMfaCode(ALICE_USERNAME)
  const session = await json(`${IDENTITY_URL}/v1/auth/mfa/verify`, {
    method: 'POST',
    body: JSON.stringify({ mfaToken: challenge.mfaToken, totpCode: code }),
  })
  const auth = { Authorization: `Bearer ${session.accessToken}` }
  const dashboard = await json(`${IDENTITY_URL}/v1/me/dashboard`, { headers: auth })
  const history = await json(`${IDENTITY_URL}/v1/accounts/customer:alice/history`, { headers: auth })
  const account = dashboard.accounts.find((a) => a.accountId === 'customer:alice')
  console.log(`  alice dashboard: balance ${account?.balance}, ${history.length} history lines`)
  return dashboard
}

async function baseline() {
  console.log('[baseline] ensuring every Cell is healthy')
  await ensureAllHealthy()
  await checkHealthMap()
  await checkIntegrityClean(CELL_ID)
  console.log('[baseline] alice login -> MFA -> dashboard, real end to end')
  await checkAliceDashboard()
  console.log('[baseline] ready. states a, b, d, e can all be captured from here.')
  console.log(
    '[baseline] for screenshot b (transfer mid step-up): use a payee alice has never paid before, ' +
      'e.g. merchant:helas-hardware, so FR-04 new-payee step-up actually triggers.'
  )
}

async function quarantinePending() {
  console.log(`[quarantine-pending] ${CELL_ID}: requesting quarantine as ${REQUESTER}, leaving ${APPROVER} unapproved`)
  const status = await ensureQuarantinePending(CELL_ID)
  await checkHealthMap()
  console.log(`[quarantine-pending] ready: ${JSON.stringify(status)}. Capture screenshot c now.`)
}

async function restore() {
  console.log('[restore] lifting any quarantine on every Cell, back to healthy')
  await ensureAllHealthy()
  await checkHealthMap()
  console.log('[restore] done. Safe to leave the stack running for the next lane.')
}

const mode = process.argv[2] ?? 'baseline'
const modes = { baseline, 'quarantine-pending': quarantinePending, restore }

if (!modes[mode]) {
  console.error(`Unknown mode "${mode}". Expected one of: ${Object.keys(modes).join(', ')}`)
  process.exit(1)
}

try {
  await modes[mode]()
} catch (error) {
  console.error(`[${mode}] failed:`, error instanceof Error ? error.message : error)
  process.exit(1)
}
