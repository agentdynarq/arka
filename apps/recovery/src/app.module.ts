import { Module } from '@nestjs/common'
import { RecoveryService } from '@arka/recovery'
import { buildRecoveryService } from './recovery-provider.ts'
import { HealthController } from './health/health.controller.ts'
import { HealthMapController } from './health/health-map.controller.ts'
import { QuarantineController } from './quarantine/quarantine.controller.ts'
import { AuditController } from './audit/audit.controller.ts'
import { IntegrityController } from './integrity/integrity.controller.ts'

@Module({
  controllers: [HealthController, HealthMapController, QuarantineController, AuditController, IntegrityController],
  providers: [{ provide: RecoveryService, useFactory: buildRecoveryService }],
})
export class AppModule {}
