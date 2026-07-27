import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import type { Role } from '@arka/identity'

/**
 * The minimal request shape this app touches. Not `import type { Request }
 * from 'express'`: that would add a type-only dependency on a package
 * nothing here otherwise needs, for two fields NestJS already exposes.
 */
export interface AuthenticatedRequest {
  readonly headers: Record<string, string | string[] | undefined>
  session?: { userId: string; role: Role }
}

/**
 * Verifies the `Authorization: Bearer <accessToken>` header against
 * `IdentityService.verifyAccessToken` and attaches the result to the
 * request. Every check that decides whether a token is live, expired or
 * belongs to a revoked family lives in `@arka/identity`; this guard is only
 * the HTTP adapter over it.
 */
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const header = request.headers.authorization
    const headerValue = Array.isArray(header) ? header[0] : header

    if (!headerValue || !headerValue.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer access token')
    }

    const accessToken = headerValue.slice('Bearer '.length)
    const session = await this.identity.verifyAccessToken(accessToken)
    if (!session) {
      throw new UnauthorizedException('Access token is invalid or expired')
    }

    request.session = session
    return true
  }
}
