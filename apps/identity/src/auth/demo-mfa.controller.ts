import { BadRequestException, Controller, Get, NotFoundException, Query } from '@nestjs/common'
import { PgUserStore, totpAt } from '@arka/identity'
import { databaseUrl } from '../identity-provider.ts'

const TOTP_STEP_SECONDS = 30

export interface DemoMfaCodeResponse {
  readonly username: string
  readonly code: string
  readonly expiresInSeconds: number
}

let store: PgUserStore | null = null
function userStore(): PgUserStore {
  if (!store) store = new PgUserStore(databaseUrl())
  return store
}

/**
 * Judge-facing convenience only, same spirit as `bootstrap-demo.ts`'s
 * `[DEMO MODE]` boot log, over HTTP instead of a one-shot console line: a
 * judge who has already restarted the identity server once for a fresh code
 * should not have to do it again every 30 seconds. 404s, not a 401/403,
 * unless `DEMO_MFA_ENDPOINT_ENABLED` is explicitly set: a refusal still
 * confirms the route exists, a 404 does not. `NODE_ENV` alone is
 * deliberately not the gate, since a judge's environment is not guaranteed
 * to be `production` just because this should stay off by default there.
 *
 * Calls `totpAt()` fresh on every request rather than caching a value at
 * boot, so the returned code actually rotates across the real 30s TOTP
 * window instead of going stale mid-demo. Reads `mfaSecret` straight off
 * the same `PgUserStore` `bootstrap-demo.ts` already uses; never touches
 * `IdentityService.login`/`verifyMfa`, so the real MFA path is untouched.
 */
@Controller('v1/auth')
export class DemoMfaController {
  @Get('demo/mfa-code')
  async mfaCode(@Query('username') username?: string): Promise<DemoMfaCodeResponse> {
    if (process.env.DEMO_MFA_ENDPOINT_ENABLED !== 'true') {
      throw new NotFoundException()
    }
    if (typeof username !== 'string' || username.trim().length === 0) {
      throw new BadRequestException({ code: 'INVALID_REQUEST', message: 'username is required' })
    }

    const user = await userStore().getByUsername(username)
    if (!user) {
      throw new NotFoundException({ code: 'USER_NOT_FOUND', message: `No demo user "${username}"` })
    }

    const now = Date.now()
    const code = totpAt(user.mfaSecret, now)
    const secondsIntoStep = Math.floor(now / 1000) % TOTP_STEP_SECONDS
    const expiresInSeconds = TOTP_STEP_SECONDS - secondsIntoStep

    return { username, code, expiresInSeconds }
  }
}
