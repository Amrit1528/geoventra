import { Module } from '@nestjs/common';
import { IntelligenceService } from './intelligence.service.js';
import { TpmsModule } from '../tpms/tpms.module.js';
import { EngineDiagnosticsModule } from '../engine-diagnostics/engine-diagnostics.module.js';
import { TripsModule } from '../trips/trips.module.js';
import { TrackingModule } from '../tracking/tracking.module.js';
import { IntelligenceController } from './intelligence.controller.js';

@Module({
  controllers: [IntelligenceController],
  imports: [TpmsModule, EngineDiagnosticsModule, TripsModule, TrackingModule],
  providers: [IntelligenceService],
  exports: [IntelligenceService],
})
export class IntelligenceModule {}