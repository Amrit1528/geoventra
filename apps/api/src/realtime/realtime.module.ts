/**
 * GEOVENTRA — realtime module.
 *
 * Hosts the websocket gateways. The engine gateway consumes the engine event bus; the
 * tracking gateway consumes the tracking event bus.
 */

import { Module } from '@nestjs/common';
import { EngineGateway } from './engine.gateway.js';
import { TrackingGateway } from './tracking.gateway.js';
import { EngineDiagnosticsModule } from '../engine-diagnostics/engine-diagnostics.module.js';
import { TrackingModule } from '../tracking/tracking.module.js';

@Module({
  imports: [EngineDiagnosticsModule, TrackingModule],
  providers: [EngineGateway, TrackingGateway],
})
export class RealtimeModule {}
