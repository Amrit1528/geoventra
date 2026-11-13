/**
 * GEOVENTRA — organizations module.
 *
 * Registers the organization controller and service.
 */

import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller.js';
import { OrganizationsService } from './organizations.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}