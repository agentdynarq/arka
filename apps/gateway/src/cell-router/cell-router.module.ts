import { Module } from '@nestjs/common'
import { CellRouterController } from './cell-router.controller.ts'
import { CellRouterService } from './cell-router.service.ts'

@Module({
  controllers: [CellRouterController],
  providers: [CellRouterService],
  exports: [CellRouterService],
})
export class CellRouterModule {}
