import type { OutboxWriter } from './outbox-writer.ts'
import type { DomainEvent } from './types.ts'

/** In-memory `OutboxWriter`, used by unit tests. */
export class InMemoryOutboxWriter implements OutboxWriter {
  readonly #events = new Map<string, { event: DomainEvent; published: boolean }>()

  async write(event: DomainEvent): Promise<void> {
    this.#events.set(event.eventId, { event, published: false })
  }

  async pending(limit?: number): Promise<DomainEvent[]> {
    const unpublished = [...this.#events.values()]
      .filter((e) => !e.published)
      .map((e) => e.event)
    return limit === undefined ? unpublished : unpublished.slice(0, limit)
  }

  async markPublished(eventIds: readonly string[]): Promise<void> {
    for (const id of eventIds) {
      const entry = this.#events.get(id)
      if (entry) entry.published = true
    }
  }
}
