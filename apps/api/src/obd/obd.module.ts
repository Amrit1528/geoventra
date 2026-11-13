/** GEOVENTRA — OBD-II module.
 *  Registers the OBD-II controller and service.
 */

import { Module } from '@nestjs/common';
import { ObdController } from './obd.controller.js';
import { ObdService } from './obd.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  controllers: [ObdController],
  providers: [ObdService, AdminService],
  exports: [ObdService],
})
export class ObdModule {}
