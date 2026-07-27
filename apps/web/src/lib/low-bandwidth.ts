/**
 * FR-15: low-bandwidth mode. A customer preference, not a server-detected
 * network condition, since guessing connection quality from the browser is
 * unreliable and this platform does not fabricate signals it cannot really
 * observe. Persisted in `localStorage` so it survives a reload and applies to
 * every screen without asking again, screen W4 is only where it is set.
 */
const STORAGE_KEY = 'arka:low-bandwidth'

/** How many of the newest transaction lines a low-bandwidth dashboard asks for, instead of the full history. */
export const LOW_BANDWIDTH_HISTORY_LIMIT = 10

export function isLowBandwidthEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

export function setLowBandwidthEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  if (enabled) {
    window.localStorage.setItem(STORAGE_KEY, '1')
  } else {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}
