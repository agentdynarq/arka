import { Injectable } from '@nestjs/common'
import { cellRouteResponse } from '@arka/contracts'
import type { CellRouteResponse } from '@arka/contracts'
import { assignCell } from './stable-hash.ts'

/**
 * Reads the configured Cell set once at startup from `CELL_IDS`, for example
 * "cell-1,cell-2". Adding a Cell is an environment change, never a code
 * change, per the "Cell is configuration" invariant in CLAUDE.md.
 */
@Injectable()
export class CellRouterService {
  private readonly cellIds: readonly string[]

  constructor() {
    const raw = process.env.CELL_IDS
    if (!raw || raw.trim().length === 0) {
      throw new Error('CELL_IDS must be set, for example "cell-1,cell-2"')
    }
    this.cellIds = raw
      .split(',')
      .map((id) => id.trim())
      .filter((id) => id.length > 0)
  }

  route(customerId: string): CellRouteResponse {
    const cellId = assignCell(customerId, this.cellIds)
    return cellRouteResponse.parse({
      customerId,
      cellId,
      routedAt: new Date().toISOString(),
    })
  }
}
