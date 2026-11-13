/** GEOVENTRA — fleet groups module.
 *  Registers the fleet groups controller and service.
 */

import { Module } from '@nestjs/common';
import { FleetGroupsController } from './fleet-groups.controller.js';
import { FleetGroupsService } from './fleet-groups.service.js';
import { AdminService } from '../admin.service.js';

@Module({
  controllers: [FleetGroupsController],
  providers: [FleetGroupsService, AdminService],
  exports: [FleetGroupsService],
})
export class FleetGroupsModule {}
