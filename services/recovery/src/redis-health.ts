import { Redis } from 'ioredis'

/**
 * True if a Redis server is reachable at `url` within one second. Same
 * contract and rationale as `isPostgresReachable` in `@arka/ledger`: a
 * short, bounded probe with its own connection, never the app's shared
 * client, so a health check can never itself exhaust a connection pool.
 *
 * `ioredis` emits an `'error'` event on a failed connection attempt that,
 * left unhandled, crashes the process; a no-op listener is attached before
 * connecting specifically to prevent that, not to silently ignore a real
 * runtime error elsewhere.
 */
export async function isRedisReachable(url: string): Promise<boolean> {
  const client = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  })
  client.on('error', () => {})

  try {
    await client.connect()
    await client.ping()
    return true
  } catch {
    return false
  } finally {
    client.disconnect()
  }
}
