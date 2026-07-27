import { Module } from '@nestjs/common'
import { RecoveryService } from '@arka/recovery'
import { CellRouterController } from './cell-router.controller.ts'
import { CellRouterService } from './cell-router.service.ts'
import { buildRecoveryService } from '../recovery-provider.ts'

@Module({
  controllers: [CellRouterController],
  providers: [CellRouterService, { provide: RecoveryService, useFactory: buildRecoveryService }],
  exports: [CellRouterService],
})
export class CellRouterModule {}
