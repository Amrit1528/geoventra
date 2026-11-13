/** GEOVENTRA — roles module.
 *  Registers the roles controller and service.
 */

import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';
import { AdminService } from '../admin.service.js';

@Module({
  controllers: [RolesController],
  providers: [RolesService, AdminService],
  exports: [RolesService],
})
export class RolesModule {}
