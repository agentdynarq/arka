/**
 * Session tokens live in `sessionStorage`, not a cookie: this is a 10%
 * client-side bucket demonstrating the W1 journey end to end, not a
 * production session-storage design (that would be an httpOnly cookie set by
 * the server). Cleared when the tab closes, which is the right default for a
 * demo credential.
 */
const ACCESS_TOKEN_KEY = 'arka.accessToken'
const REFRESH_TOKEN_KEY = 'arka.refreshToken'

export function storeSession(accessToken: string, refreshToken: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken)
  sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
}

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY)
}

export function clearSession(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY)
  sessionStorage.removeItem(REFRESH_TOKEN_KEY)
}
