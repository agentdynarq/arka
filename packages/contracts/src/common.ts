/**
 * Shared primitives used across every domain schema.
 *
 * Money crosses the wire as a digit string, never a JSON number and never a
 * float. `bigint` cannot be serialised by `JSON.stringify`, so services parse
 * these strings into `bigint` at the boundary and stay in `bigint` from there
 * on. See docs/adr/0002.
 */
import { z } from 'zod'

const POSITIVE_MINOR_UNITS = /^[1-9]\d*$/
const SIGNED_MINOR_UNITS = /^-?(0|[1-9]\d*)$/

/** A strictly positive amount in minor units. Used on requests that move money. */
export const positiveAmount = z
  .string()
  .regex(POSITIVE_MINOR_UNITS, 'amount must be a positive integer string in minor units')
  .transform((value) => BigInt(value))

/** A balance or projection, which may legitimately be zero. Never negative in Arka's model. */
export const nonNegativeAmount = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'amount must be a non-negative integer string in minor units')
  .transform((value) => BigInt(value))

/** For fields that could theoretically be signed, such as a running delta. */
export const signedAmount = z
  .string()
  .regex(SIGNED_MINOR_UNITS, 'amount must be a signed integer string in minor units')
  .transform((value) => BigInt(value))

/** ISO 8601, UTC, matching the timestamp convention in ledger-core. */
export const isoTimestamp = z.iso.datetime({ offset: true })

/**
 * A Cell is configuration, not code. This schema never enumerates Cell ids as
 * a literal union, because doing so would bake "which Cells exist" into the
 * type system, exactly the branch-on-Cell pattern the architecture forbids.
 * See docs/adr/0001.
 */
export const cellId = z.string().min(1)

/** The client-supplied key that makes a payment request safe to retry. See docs/adr/0002. */
export const idempotencyKey = z.string().min(1).max(255)

export const role = z.enum(['customer', 'operator'])
export type Role = z.infer<typeof role>

export const apiError = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  details: z.unknown().optional(),
})
export type ApiError = z.infer<typeof apiError>

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z.string().optional(),
  })
}
