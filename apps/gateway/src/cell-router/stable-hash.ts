/**
 * The Cell Router's assignment function. A customer always lands on the same
 * Cell for a given configured Cell set, and the assignment does not depend on
 * the order Cells are listed, only on which Cells exist. See docs/adr/0001.
 */
import { createHash } from 'node:crypto'

export function assignCell(customerId: string, cellIds: readonly string[]): string {
  if (cellIds.length === 0) {
    throw new Error('at least one Cell must be configured')
  }

  const sorted = [...cellIds].sort()
  const digest = createHash('sha256').update(customerId).digest()
  const index = digest.readUInt32BE(0) % sorted.length
  const assigned = sorted[index]
  if (assigned === undefined) {
    throw new Error('unreachable: hash index out of bounds')
  }
  return assigned
}
