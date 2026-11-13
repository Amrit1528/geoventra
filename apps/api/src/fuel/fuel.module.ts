/** GEOVENTRA — fuel module.
 *  Registers the fuel controller and service.
 */

import { Module } from '@nestjs/common';
import { FuelController } from './fuel.controller.js';
import { FuelService } from './fuel.service.js';

@Module({
  controllers: [FuelController],
  providers: [FuelService],
  exports: [FuelService],
})
export class FuelModule {}
