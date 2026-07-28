/**
 * Runs against the real control-plane Postgres from docker-compose.yml.
 * Skips with a clear reason, rather than failing, when nothing is
 * listening.
 *
 * `PgQuarantineStore` and `PgAuditTrailStore` share the one `recovery`
 * schema, so both live in this one file, same reasoning as
 * `services/identity/test/pg-stores.integration.test.ts`: resetting a
 * shared schema concurrently from more than one test file is a real
 * collision, not a hypothetical one.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { isPostgresReachable, ensureTestDatabase } from '@arka/ledger'

import { PgQuarantineStore } from '../src/pg-quarantine-store.ts'
import { PgAuditTrailStore } from '../src/pg-audit-trail-store.ts'
import { appendAuditRecord } from '../src/audit-hash.ts'

const BASE_CONNECTION_STRING =
  process.env.TEST_CONTROL_PLANE_DATABASE_URL ??
  'postgres://arka_control:change-me-control-plane@localhost:5435/arka_control'

const reachable = await isPostgresReachable(BASE_CONNECTION_STRING)
// A genuinely separate database from the one `pnpm seed` populates: resetSchema()
// below must never touch demo data. See ensureTestDatabase's doc comment.
const CONNECTION_STRING = reachable ? await ensureTestDatabase(BASE_CONNECTION_STRING, 'arka_control_test') : BASE_CONNECTION_STRING
const skip = reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first`

describe('Recovery Postgres stores, against a real Postgres', { skip }, () => {
  let quarantineStore: PgQuarantineStore
  let auditTrailStore: PgAuditTrailStore

  before(async () => {
    quarantineStore = new PgQuarantineStore(CONNECTION_STRING)
    await quarantineStore.resetSchema()
    auditTrailStore = new PgAuditTrailStore(CONNECTION_STRING)
  })

  after(async () => {
    await quarantineStore.close()
    await auditTrailStore.close()
  })

  describe('PgQuarantineStore', () => {
    test('ensureRow is idempotent and starts a Cell at state none', async () => {
      const first = await quarantineStore.ensureRow('cell-1')
      const second = await quarantineStore.ensureRow('cell-1')
      assert.equal(first.state, 'none')
      assert.deepEqual(second, first)
    })

    test('startPending succeeds only when the current state matches the precondition', async () => {
      const started = await quarantineStore.startPending('cell-2', 'quarantine', 'operator-1', 'reason', 'none')
      assert.equal(started.started, true)
      assert.equal(started.row.state, 'pending_second_approval')

      const blocked = await quarantineStore.startPending('cell-2', 'quarantine', 'operator-2', 'reason', 'none')
      assert.equal(blocked.started, false)
      assert.equal(blocked.row.state, 'pending_second_approval', 'reports the real current row, not a generic failure')
    })

    test('addApprover rejects the same operator twice and finalises on a second, distinct one', async () => {
      await quarantineStore.startPending('cell-3', 'quarantine', 'operator-1', 'reason', 'none')

      const rejected = await quarantineStore.addApprover('cell-3', 'operator-1', 'quarantine')
      assert.equal(rejected.added, false)

      const finalised = await quarantineStore.addApprover('cell-3', 'operator-2', 'quarantine')
      assert.equal(finalised.added, true)
      assert.equal(finalised.row.state, 'quarantined')
      assert.deepEqual(finalised.row.approvedBy, ['operator-1', 'operator-2'])
    })

    test(
      'ten genuinely concurrent approvals from ten distinct operators, fired with Promise.all against a real ' +
        'database, still let exactly one finalise the quarantine',
      async () => {
        await quarantineStore.startPending('cell-4', 'quarantine', 'requesting-operator', 'reason', 'none')

        const operators = Array.from({ length: 10 }, (_, i) => `operator-${i}`)
        const outcomes = await Promise.all(operators.map((op) => quarantineStore.addApprover('cell-4', op, 'quarantine')))

        const added = outcomes.filter((o) => o.added)
        assert.equal(added.length, 1, 'exactly one of ten concurrent distinct approvers must land as the second approval')

        const final = await quarantineStore.get('cell-4')
        assert.equal(final.state, 'quarantined')
        assert.equal(final.approvedBy.length, 2)
      }
    )

    test('a completed lift resets approvedBy to a clean slate', async () => {
      await quarantineStore.startPending('cell-5', 'quarantine', 'operator-1', 'reason', 'none')
      await quarantineStore.addApprover('cell-5', 'operator-2', 'quarantine')

      await quarantineStore.startPending('cell-5', 'lift', 'operator-3', null, 'quarantined')
      const lifted = await quarantineStore.addApprover('cell-5', 'operator-1', 'lift')

      assert.equal(lifted.row.state, 'none')
      assert.deepEqual(lifted.row.approvedBy, [])
    })
  })

  describe('PgAuditTrailStore', () => {
    test('appends link correctly and read returns them in sequence order', async () => {
      const first = appendAuditRecord(null, 'operator-1', 'quarantine.requested', 'cell-1')
      await auditTrailStore.append(first, null)

      const head = await auditTrailStore.head()
      assert.equal(head?.seq, first.seq)

      const second = appendAuditRecord(head, 'operator-2', 'quarantine.approved', 'cell-1')
      await auditTrailStore.append(second, head?.seq ?? null)

      const all = await auditTrailStore.read()
      assert.equal(all.length, 2)
      assert.equal(all[1]?.prevHash, all[0]?.hash)
    })

    test('rejects an append against a stale expected head', async () => {
      const head = await auditTrailStore.head()
      const stale = appendAuditRecord(head, 'operator-1', 'phantom.action', null)
      await auditTrailStore.append(stale, head?.seq ?? null)

      const staleAgain = appendAuditRecord(head, 'operator-1', 'duplicate.action', null)
      await assert.rejects(() => auditTrailStore.append(staleAgain, head?.seq ?? null))
    })
  })
})
