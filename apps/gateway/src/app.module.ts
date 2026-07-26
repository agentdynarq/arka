import { Module } from '@nestjs/common'
import { CellRouterModule } from './cell-router/cell-router.module.ts'
import { HealthController } from './health/health.controller.ts'

@Module({
  imports: [CellRouterModule],
  controllers: [HealthController],
})
export class AppModule {}
