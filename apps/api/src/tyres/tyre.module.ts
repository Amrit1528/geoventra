/** GEOVENTRA — tyre module.
 *  Registers the tyre controller and service.
 */

import { Module } from '@nestjs/common';
import { TyreController } from './tyre.controller.js';
import { TyreService } from './tyre.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  controllers: [TyreController],
  providers: [TyreService, AdminService],
  exports: [TyreService],
})
export class TyreModule {}
