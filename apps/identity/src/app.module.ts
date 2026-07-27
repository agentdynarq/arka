import { Module } from '@nestjs/common'
import { IdentityService } from '@arka/identity'
import { AccountsService } from '@arka/accounts'
import { buildIdentityService, buildAccountsService } from './identity-provider.ts'
import { AuthController } from './auth/auth.controller.ts'
import { StepUpController } from './auth/step-up.controller.ts'
import { AccessTokenGuard } from './auth/access-token.guard.ts'
import { ReVerifyController } from './reverify/reverify.controller.ts'
import { AccountOpeningController } from './account-opening/account-opening.controller.ts'
import { DashboardController } from './dashboard/dashboard.controller.ts'
import { HealthController } from './health/health.controller.ts'

@Module({
  controllers: [
    HealthController,
    AuthController,
    StepUpController,
    ReVerifyController,
    AccountOpeningController,
    DashboardController,
  ],
  providers: [
    { provide: IdentityService, useFactory: buildIdentityService },
    { provide: AccountsService, useFactory: buildAccountsService },
    AccessTokenGuard,
  ],
})
export class AppModule {}
