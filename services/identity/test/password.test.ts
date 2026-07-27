import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword } from '../src/password.ts'

describe('password hashing', () => {
  test('a hash never contains the plaintext', async () => {
    const plaintext = 'correct horse battery staple'
    const hash = await hashPassword(plaintext)
    assert.ok(!hash.includes(plaintext))
    assert.match(hash, /^\$argon2id\$/)
  })

  test('the same password hashes differently each time (random salt)', async () => {
    const a = await hashPassword('same-password')
    const b = await hashPassword('same-password')
    assert.notEqual(a, b)
  })

  test('verifies a correct password', async () => {
    const hash = await hashPassword('my-real-password')
    assert.equal(await verifyPassword(hash, 'my-real-password'), true)
  })

  test('rejects an incorrect password', async () => {
    const hash = await hashPassword('my-real-password')
    assert.equal(await verifyPassword(hash, 'not-the-password'), false)
  })

  test('rejects against a malformed hash rather than throwing', async () => {
    assert.equal(await verifyPassword('not-a-real-hash', 'anything'), false)
  })
})
