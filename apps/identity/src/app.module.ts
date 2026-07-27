import { Module } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { PaymentsService } from '@arka/payments'
import { buildIdentityService, buildAccountsService, buildPaymentsService } from './identity-provider.ts'
import { AuthController } from './auth/auth.controller.ts'
import { StepUpController } from './auth/step-up.controller.ts'
import { AccessTokenGuard } from './auth/access-token.guard.ts'
import { ReVerifyController } from './reverify/reverify.controller.ts'
import { AccountOpeningController } from './account-opening/account-opening.controller.ts'
import { DashboardController } from './dashboard/dashboard.controller.ts'
import { HealthController } from './health/health.controller.ts'
import { TransfersController } from './payments/transfers.controller.ts'
import { HistoryController } from './payments/history.controller.ts'

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
  ],
  providers: [
    { provide: IdentityService, useFactory: buildIdentityService },
    { provide: AccountsService, useFactory: buildAccountsService },
    { provide: PaymentsService, useFactory: buildPaymentsService },
    AccessTokenGuard,
  ],
})
export class AppModule {}
