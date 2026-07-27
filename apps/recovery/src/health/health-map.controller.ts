import { Controller, Get, Inject } from '@nestjs/common'
import { RecoveryService } from '@arka/recovery'
import type { CellHealthSnapshot } from '@arka/contracts'

/** FR-21, screen W5: live status for every configured Cell. */
@Controller('v1/recovery')
export class HealthMapController {
  constructor(@Inject(RecoveryService) private readonly recovery: RecoveryService) {}

  @Get('health-map')
  async healthMap(): Promise<CellHealthSnapshot[]> {
    return this.recovery.healthMap()
  }
}
