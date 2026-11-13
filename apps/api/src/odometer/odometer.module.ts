/** GEOVENTRA — odometer module.
 *  Registers the odometer controller and service.
 */

import { Module } from '@nestjs/common';
import { OdometerController } from './odometer.controller.js';
import { OdometerService } from './odometer.service.js';

@Module({
  controllers: [OdometerController],
  providers: [OdometerService],
  exports: [OdometerService],
})
export class OdometerModule {}
