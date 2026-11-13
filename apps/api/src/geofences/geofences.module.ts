/**
 * GEOVENTRA — geofences module.
 *
 * Owns geofence CRUD, vehicle assignment, the ingest-time containment evaluator and the
 * geofence event history. Exported so the Tracking module can run evaluation on ingest.
 */

import { Module } from '@nestjs/common';
import { GeofencesController } from './geofences.controller.js';
import { GeofencesService } from './geofences.service.js';
import { GeofencesRepository } from './geofences.repository.js';

@Module({
  controllers: [GeofencesController],
  providers: [GeofencesService, GeofencesRepository],
  exports: [GeofencesService],
})
export class GeofencesModule {}
