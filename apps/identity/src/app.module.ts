import { Module } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { PaymentsService } from '@arka/payments'
import { NotificationsService } from '@arka/notifications'
import {
  buildIdentityService,
  buildAccountsService,
  buildPaymentsService,
  buildNotificationsService,
} from './identity-provider.ts'
import { AuthController } from './auth/auth.controller.ts'
import { StepUpController } from './auth/step-up.controller.ts'
import { AccessTokenGuard } from './auth/access-token.guard.ts'
import { ReVerifyController } from './reverify/reverify.controller.ts'
import { AccountOpeningController } from './account-opening/account-opening.controller.ts'
import { DashboardController } from './dashboard/dashboard.controller.ts'
import { HealthController } from './health/health.controller.ts'
import { TransfersController } from './payments/transfers.controller.ts'
import { HistoryController } from './payments/history.controller.ts'
import { LimitsController } from './payments/limits.controller.ts'
import { NotificationsController } from './notifications/notifications.controller.ts'

@Module({
  controllers: [
    HealthController,
    AuthController,
    StepUpController,
    ReVerifyController,
    AccountOpeningController,
    DashboardController,
    TransfersController,
    HistoryController,
    LimitsController,
    NotificationsController,
  ],
  providers: [
    { provide: IdentityService, useFactory: buildIdentityService },
    { provide: AccountsService, useFactory: buildAccountsService },
    { provide: PaymentsService, useFactory: buildPaymentsService },
    { provide: NotificationsService, useFactory: buildNotificationsService },
    AccessTokenGuard,
  ],
})
export class AppModule {}
