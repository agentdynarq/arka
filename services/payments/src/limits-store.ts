/** FR-12: where a customer's daily transfer limit override lives, if they have set one. */
export interface LimitsStore {
  /** `null` means no override has been set; the caller applies the platform default. */
  get(accountId: string): Promise<bigint | null>
  set(accountId: string, limit: bigint): Promise<void>
}
