import type { OutboxWriter } from './outbox-writer.ts'
import type { EventBus } from './event-bus.ts'

/**
 * The worker `CLAUDE.md` describes: "A worker publishes to Redis Streams."
 *
 * Publishes every currently-pending outbox event to the bus, then marks them
 * published. If the process dies between the publish and the mark, those
 * events are republished on the next call: at-least-once, by design, which
 * is why every consumer on the other end must dedupe on `event.eventId`.
 *
 * Returns how many events were relayed, so a caller can decide whether to
 * keep draining (returned a full batch, more may be pending) or wait.
 */
export async function relayPendingEvents(
  outbox: OutboxWriter,
  bus: EventBus,
  streamName: string,
  batchSize = 100
): Promise<number> {
  const pending = await outbox.pending(batchSize)
  if (pending.length === 0) return 0

  for (const event of pending) {
    await bus.publish(streamName, event)
  }
  await outbox.markPublished(pending.map((e) => e.eventId))

  return pending.length
}
