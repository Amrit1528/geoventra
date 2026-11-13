/** GEOVENTRA — alert engine module.
 *  Registers the unified alert controller and service.
 */

import { Module } from '@nestjs/common';
import { AlertController } from './alert.controller.js';
import { AlertService } from './alert.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  controllers: [AlertController],
  providers: [AlertService, AdminService],
  exports: [AlertService],
})
export class AlertModule {}
