/** GEOVENTRA — insurance module.
 *  Registers the insurance controller and service.
 */

import { Module } from '@nestjs/common';
import { InsuranceController } from './insurance.controller.js';
import { InsuranceService } from './insurance.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  controllers: [InsuranceController],
  providers: [InsuranceService, AdminService],
  exports: [InsuranceService],
})
export class InsuranceModule {}
