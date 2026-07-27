import type { AgentCashDirection } from './types.ts'

/** One pending agent cash-in/cash-out request, awaiting the customer's OTP. */
export interface AgentCashRow {
  readonly requestId: string
  readonly agentId: string
  readonly agentAccountId: string
  readonly customerAccountId: string
  readonly direction: AgentCashDirection
  readonly amount: bigint
  readonly otpCode: string
  readonly expiresAt: string
  readonly consumedAt: string | null
}

/** Where a pending agent cash request lives between `requestAgentCash` and `completeAgentCash`. */
export interface AgentCashStore {
  create(row: Omit<AgentCashRow, 'consumedAt'>): Promise<void>
  get(requestId: string): Promise<AgentCashRow | null>

  /**
   * Atomically marks the request consumed, only if it was not already
   * consumed. Returns `true` if this call won that race, `false` if another
   * call consumed it first. Two `completeAgentCash` calls for the same
   * request, with two different idempotency keys, both reading `consumedAt:
   * null` from a plain `get` before either writes, would otherwise both
   * proceed to a real transfer, one OTP spent twice. The `get`-then-`consume`
   * shape looks safe; only an atomic `consume` closes that window.
   */
  consume(requestId: string): Promise<boolean>
}
