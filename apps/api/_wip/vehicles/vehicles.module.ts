/** GEOVENTRA — vehicles module.
 *  Registers the vehicles controller and service for fleet registry management.
 */

import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService, DatabaseService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
