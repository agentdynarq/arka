import { Redis } from 'ioredis'
import type { EventBus, StreamMessage } from './event-bus.ts'
import type { DomainEvent } from './types.ts'

/** `EventBus` backed by Redis Streams, per docs/adr/0004. */
export class RedisStreamEventBus implements EventBus {
  readonly #redis: Redis

  constructor(connectionUrl: string) {
    this.#redis = new Redis(connectionUrl, { maxRetriesPerRequest: null })
  }

  async publish(streamName: string, event: DomainEvent): Promise<void> {
    await this.#redis.xadd(streamName, '*', 'event', JSON.stringify(event))
  }

  async #ensureGroup(streamName: string, groupName: string): Promise<void> {
    try {
      await this.#redis.xgroup('CREATE', streamName, groupName, '0', 'MKSTREAM')
    } catch (error) {
      // BUSYGROUP means the group already exists. Expected on every call after the first, not an error.
      const message = error instanceof Error ? error.message : ''
      if (!message.includes('BUSYGROUP')) throw error
    }
  }

  /**
   * Two reads, not one. `'>'` is Redis's own cursor for "messages never
   * delivered to this group before", it does not resurface a message this
   * same consumer already received but never acked; that is what reading
   * `'0'` (this consumer's own pending list) returns instead. Reading only
   * `'>'` would make an unacknowledged message effectively lost the moment
   * it was first delivered, the opposite of the at-least-once guarantee this
   * interface documents. Read the consumer's own pending entries first, so a
   * crashed-before-acking consumer recovers them, then top up with genuinely
   * new messages.
   */
  async readGroup(streamName: string, groupName: string, consumerName: string, count = 10): Promise<StreamMessage[]> {
    await this.#ensureGroup(streamName, groupName)

    const pending = await this.#readEntries(streamName, groupName, consumerName, count, '0')
    if (pending.length >= count) return pending.slice(0, count)

    const fresh = await this.#readEntries(streamName, groupName, consumerName, count - pending.length, '>')
    return [...pending, ...fresh]
  }

  async #readEntries(
    streamName: string,
    groupName: string,
    consumerName: string,
    count: number,
    cursor: '0' | '>'
  ): Promise<StreamMessage[]> {
    const result = (await this.#redis.xreadgroup(
      'GROUP',
      groupName,
      consumerName,
      'COUNT',
      count,
      'STREAMS',
      streamName,
      cursor
    )) as [string, [string, string[]][]][] | null

    if (!result) return []
    const [, entries] = result[0]!
    // Reading '0' can return an entry whose fields are empty ([]) if it was
    // trimmed from the stream (XDEL/XTRIM) while still in the PEL. Skip
    // those rather than throwing: there is nothing left to deliver for them.
    return entries.filter(([, fields]) => fields.length > 0).map(([messageId, fields]) => ({
      messageId,
      event: fieldsToEvent(fields),
    }))
  }

  async ack(streamName: string, groupName: string, messageIds: readonly string[]): Promise<void> {
    if (messageIds.length === 0) return
    await this.#redis.xack(streamName, groupName, ...messageIds)
  }

  /** Release the underlying Redis connection. Callers own this bus's lifetime. */
  async close(): Promise<void> {
    this.#redis.disconnect()
  }
}

/** Redis Streams stores fields as a flat [key, value, key, value, ...] array; `publish` writes one field, `event`. */
function fieldsToEvent(fields: readonly string[]): DomainEvent {
  const index = fields.indexOf('event')
  if (index === -1 || fields[index + 1] === undefined) {
    throw new Error('Stream entry is missing its "event" field')
  }
  return JSON.parse(fields[index + 1]!) as DomainEvent
}
