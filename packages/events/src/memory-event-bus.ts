import type { EventBus, StreamMessage } from './event-bus.ts'
import type { DomainEvent } from './types.ts'

interface GroupState {
  /** Index into the stream of the next never-delivered message. */
  cursor: number
  /** Delivered, not yet acknowledged. Redelivered on every readGroup until acked, same as Redis. */
  pending: Map<string, StreamMessage>
}

/** In-memory `EventBus`, used by unit tests. Consumer-group semantics, simplified but faithful: at-least-once, redelivers the unacknowledged. */
export class InMemoryEventBus implements EventBus {
  readonly #streams = new Map<string, StreamMessage[]>()
  readonly #groups = new Map<string, Map<string, GroupState>>()
  #seq = 0

  async publish(streamName: string, event: DomainEvent): Promise<void> {
    const stream = this.#streams.get(streamName) ?? []
    stream.push({ messageId: `${Date.now()}-${this.#seq++}`, event })
    this.#streams.set(streamName, stream)
  }

  async readGroup(streamName: string, groupName: string, _consumerName: string, count = 10): Promise<StreamMessage[]> {
    const stream = this.#streams.get(streamName) ?? []
    const groupsForStream = this.#groups.get(streamName) ?? new Map<string, GroupState>()
    this.#groups.set(streamName, groupsForStream)
    const state = groupsForStream.get(groupName) ?? { cursor: 0, pending: new Map<string, StreamMessage>() }
    groupsForStream.set(groupName, state)

    while (state.cursor < stream.length && state.pending.size < count) {
      const message = stream[state.cursor]!
      state.pending.set(message.messageId, message)
      state.cursor++
    }

    return [...state.pending.values()].slice(0, count)
  }

  async ack(streamName: string, groupName: string, messageIds: readonly string[]): Promise<void> {
    const state = this.#groups.get(streamName)?.get(groupName)
    if (!state) return
    for (const id of messageIds) state.pending.delete(id)
  }
}
