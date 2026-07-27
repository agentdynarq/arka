/**
 * Runs against the real Cell 1 Postgres from docker-compose.yml. Skips with a
 * clear reason, rather than failing, when nothing is listening. Bring the
 * stack up locally with `docker compose up` to actually exercise this suite.
 */
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { isPostgresReachable } from '@arka/ledger'

import { PgAccountRegistry } from '../src/pg-registry.ts'
import { AccountsError } from '../src/types.ts'
import type { Account } from '../src/types.ts'

const CONNECTION_STRING =
  process.env.TEST_CELL1_DATABASE_URL ?? 'postgres://arka_cell1:change-me-cell1@localhost:5433/arka_cell1'

function account(overrides: Partial<Account> = {}): Account {
  return {
    accountId: 'customer:alice',
    customerId: 'cust-1',
    displayName: 'Alice Perera',
    openedAt: '2066-01-01T00:00:00.000Z',
    ...overrides,
  }
}

const reachable = await isPostgresReachable(CONNECTION_STRING)

describe(
  'PgAccountRegistry, against a real Postgres',
  { skip: reachable ? false : `no reachable Postgres at ${CONNECTION_STRING}, run docker compose up first` },
  () => {
    let registry: PgAccountRegistry

    before(async () => {
      registry = new PgAccountRegistry(CONNECTION_STRING)
      await registry.resetSchema()
    })

    after(async () => {
      await registry.close()
    })

    test('opens and reads back an account unchanged', async () => {
      await registry.open(account())
      assert.deepEqual(await registry.get('customer:alice'), account())
    })

    test('an unknown account is null, not an error', async () => {
      assert.equal(await registry.get('customer:nobody'), null)
    })

    test('rejects opening the same account id twice, even with different details', async () => {
      await assert.rejects(
        () => registry.open(account({ displayName: 'Someone Else' })),
        (e: unknown) => e instanceof AccountsError && e.code === 'ACCOUNT_ALREADY_EXISTS'
      )
    })

    test('lists every account for a customer, and nothing for another', async () => {
      await registry.open(account({ accountId: 'customer:alice:savings', displayName: 'Alice, savings' }))
      await registry.open(account({ accountId: 'customer:bob', customerId: 'cust-2', displayName: 'Bob Silva' }))

      const forAlice = await registry.listByCustomer('cust-1')
      assert.equal(forAlice.length, 2)
      assert.ok(forAlice.every((a) => a.customerId === 'cust-1'))

      assert.equal((await registry.listByCustomer('cust-nobody')).length, 0)
    })
  }
)
