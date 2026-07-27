/** Shapes the gateway's Cell Router exposes. See docs/adr/0001. */
import { z } from 'zod'
import { cellId, isoTimestamp } from './common.ts'

export const cellRouteResponse = z.object({
  customerId: z.string().min(1),
  cellId,
  routedAt: isoTimestamp,
})
export type CellRouteResponse = z.infer<typeof cellRouteResponse>

export const cellHealthStatus = z.enum(['healthy', 'degraded', 'quarantined'])
export type CellHealthStatus = z.infer<typeof cellHealthStatus>

export const cellHealthSnapshot = z.object({
  cellId,
  status: cellHealthStatus,
  lastCheckedAt: isoTimestamp,
  latencyMs: z.number().nonnegative().optional(),
  errorRate: z.number().min(0).max(1).optional(),
})
export type CellHealthSnapshot = z.infer<typeof cellHealthSnapshot>
