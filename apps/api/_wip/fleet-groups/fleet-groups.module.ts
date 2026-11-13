/**
 * GEOVENTRA — fleet groups module.
 *
 * Registers the fleet groups controller and service.
 */

import { Module } from '@nestjs/common';
import { FleetGroupsController } from './fleet-groups.controller.js';
import { FleetGroupsService } from './fleet-groups.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  controllers: [FleetGroupsController],
  providers: [FleetGroupsService],
  exports: [FleetGroupsService],
  imports: [UsersModule], // Required for vehicle/user lookups
})
export class FleetGroupsModule {}