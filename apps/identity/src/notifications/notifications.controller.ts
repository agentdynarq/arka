import { Controller, Get, HttpException, HttpStatus, Inject, Param, Post, Req, UseGuards } from '@nestjs/common'
import { NotificationsService, NotificationsError } from '@arka/notifications'
import type { Notification } from '@arka/notifications'
import { IdentityService } from '@arka/identity'
import { AccessTokenGuard } from '../auth/access-token.guard.ts'
import type { AuthenticatedRequest } from '../auth/access-token.guard.ts'

/**
 * FR-19 and FR-20's inbox. "Real-time" at Phase 2 demo scale is a pollable
 * inbox, not push, labelled in `services/notifications/README.md` for the
 * same reason the FR-01 liveness check is labelled simulated.
 */
@Controller('v1/notifications')
@UseGuards(AccessTokenGuard)
export class NotificationsController {
  constructor(
    @Inject(IdentityService) private readonly identity: IdentityService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest): Promise<Notification[]> {
    const customerId = await customerIdFor(this.identity, request)
    return this.notifications.listForCustomer(customerId, 50)
  }

  @Post(':notificationId/read')
  async markRead(@Req() request: AuthenticatedRequest, @Param('notificationId') notificationId: string): Promise<Notification> {
    const customerId = await customerIdFor(this.identity, request)
    const existing = await this.notifications.listForCustomer(customerId)
    if (!existing.some((n) => n.notificationId === notificationId)) {
      throw new HttpException(
        { code: 'NOTIFICATION_NOT_OWNED', message: 'That notification does not belong to the authenticated customer' },
        HttpStatus.FORBIDDEN
      )
    }

    try {
      return await this.notifications.markRead(notificationId)
    } catch (error) {
      if (error instanceof NotificationsError) {
        throw new HttpException({ code: error.code, message: error.message }, HttpStatus.NOT_FOUND)
      }
      throw error
    }
  }
}

async function customerIdFor(identity: IdentityService, request: AuthenticatedRequest): Promise<string> {
  const session = request.session
  if (!session) {
    throw new HttpException({ code: 'ACCESS_TOKEN_INVALID', message: 'No session on request' }, HttpStatus.UNAUTHORIZED)
  }
  const profile = await identity.getProfile(session.userId)
  if (!profile?.customerId) {
    throw new HttpException({ code: 'NO_CUSTOMER_PROFILE', message: 'Session has no associated customer' }, HttpStatus.FORBIDDEN)
  }
  return profile.customerId
}
