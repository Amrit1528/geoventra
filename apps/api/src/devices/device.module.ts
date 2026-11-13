/** GEOVENTRA — device module.
 *  Registers the device controller and service.
 */

import { Module } from '@nestjs/common';
import { DevicesController } from './device.controller.js';
import { DevicesService } from './device.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  controllers: [DevicesController],
  providers: [DevicesService, AdminService],
  exports: [DevicesService],
})
export class DevicesModule {}
