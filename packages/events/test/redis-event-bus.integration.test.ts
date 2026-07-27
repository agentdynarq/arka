/**
 * Runs against the real Cell 1 Redis from docker-compose.yml. Skips with a
 * clear reason, rather than failing, when nothing is listening.
 */
import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'

import { RedisStreamEventBus } from '../src/redis-event-bus.ts'
import type { DomainEvent } from '../src/types.ts'

const CONNECTION_URL = process.env.TEST_CELL1_REDIS_URL ?? 'redis://:change-me-cell1-redis@localhost:6380'

async function isRedisReachable(url: string): Promise<boolean> {
  const client = new Redis(url, { lazyConnect: true, connectTimeout: 1000, maxRetriesPerRequest: 1, retryStrategy: () => null })
  client.on('error', () => {})
  try {
    await client.connect()
    await client.ping()
    return true
  } catch {
    return false
  } finally {
    client.disconnect()
  }
}

function event(): DomainEvent {
  return { eventId: randomUUID(), type: 'test.event', occurredAt: new Date().toISOString(), payload: { n: 1 } }
}

const reachable = await isRedisReachable(CONNECTION_URL)

describe(
  'RedisStreamEventBus, against a real Redis',
  { skip: reachable ? false : `no reachable Redis at ${CONNECTION_URL}, run docker compose up first` },
  () => {
    const bus = new RedisStreamEventBus(CONNECTION_URL)
    const streamName = `events-test-${randomUUID()}`

    after(async () => {
      await bus.close()
    })

    test('a published event is delivered to a consumer group', async () => {
      const e = event()
      await bus.publish(streamName, e)

      const messages = await bus.readGroup(streamName, 'group-1', 'consumer-1')
      assert.equal(messages.length, 1)
      assert.deepEqual(messages[0]!.event, e)
    })

    test('an unacknowledged message is redelivered (at-least-once)', async () => {
      const local = `${streamName}-redelivery`
      const e = event()
      await bus.publish(local, e)

      const first = await bus.readGroup(local, 'group-1', 'consumer-1')
      const second = await bus.readGroup(local, 'group-1', 'consumer-1')

      assert.equal(first.length, 1)
      assert.equal(second.length, 1)
      assert.equal(first[0]!.messageId, second[0]!.messageId)
    })

    test('an acknowledged message is not redelivered', async () => {
      const local = `${streamName}-ack`
      await bus.publish(local, event())

      const [message] = await bus.readGroup(local, 'group-1', 'consumer-1')
      await bus.ack(local, 'group-1', [message!.messageId])

      assert.equal((await bus.readGroup(local, 'group-1', 'consumer-1')).length, 0)
    })

    test('two independent consumer groups each see every message', async () => {
      const local = `${streamName}-groups`
      await bus.publish(local, event())

      const [a] = await bus.readGroup(local, 'group-a', 'c1')
      await bus.ack(local, 'group-a', [a!.messageId])

      const groupB = await bus.readGroup(local, 'group-b', 'c1')
      assert.equal(groupB.length, 1, 'group-b is independent of group-a and never acked')
    })
  }
)
