/**
 * GEOVENTRA — tracking module.
 */

import { Module } from '@nestjs/common';
import { TrackingController } from './tracking.controller.js';
import { TrackingService } from './tracking.service.js';
import { TrackingEventBus } from './tracking-events.service.js';
import { GeofencesModule } from '../geofences/geofences.module.js';
import { RoutingService } from './routing.service.js';
import { TripsModule } from '../trips/trips.module.js';

@Module({
  imports: [GeofencesModule, TripsModule],
  controllers: [TrackingController],
  providers: [TrackingService, TrackingEventBus, RoutingService],
  exports: [TrackingService, TrackingEventBus],
})
export class TrackingModule {}
