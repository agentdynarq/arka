import { Controller, Get, Param } from '@nestjs/common'
import type { CellRouteResponse } from '@arka/contracts'
import { CellRouterService } from './cell-router.service.ts'

@Controller('v1/cell-router')
export class CellRouterController {
  constructor(private readonly cellRouter: CellRouterService) {}

  @Get(':customerId')
  route(@Param('customerId') customerId: string): CellRouteResponse {
    return this.cellRouter.route(customerId)
  }
}
