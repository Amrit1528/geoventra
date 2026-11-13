/** GEOVENTRA — vehicle telemetry module.
 *  Registers the vehicle telemetry controller and service.
 */

import { Module } from '@nestjs/common';
import { VehicleTelemetryController } from './vehicle-telemetry.controller.js';
import { VehicleTelemetryService } from './vehicle-telemetry.service.js';

@Module({
  controllers: [VehicleTelemetryController],
  providers: [VehicleTelemetryService],
  exports: [VehicleTelemetryService],
})
export class VehicleTelemetryModule {}
