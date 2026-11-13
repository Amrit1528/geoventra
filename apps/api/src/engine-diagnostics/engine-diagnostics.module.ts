/**
 * GEOVENTRA — engine diagnostics module.
 *
 * Owns the Phase 5.1 engine feature set: telemetry, DTC lifecycle, freeze frames, history,
 * the diagnostic timeline and engine health charts.
 */

import { Module } from '@nestjs/common';
import { EngineDiagnosticsController } from './engine-diagnostics.controller.js';
import { EngineDiagnosticsService } from './engine-diagnostics.service.js';
import { EngineDiagnosticsRepository } from './engine-diagnostics.repository.js';
import { EngineEventsService } from './engine-events.service.js';

@Module({
  controllers: [EngineDiagnosticsController],
  providers: [EngineDiagnosticsService, EngineDiagnosticsRepository, EngineEventsService],
  exports: [EngineDiagnosticsService, EngineDiagnosticsRepository, EngineEventsService],
})
export class EngineDiagnosticsModule {}
