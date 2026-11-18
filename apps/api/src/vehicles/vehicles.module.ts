import { Module } from '@nestjs/common';
import { VehiclesController } from './vehicles.controller.js';
import { VehiclesService } from './vehicles.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  controllers: [VehiclesController],
  providers: [VehiclesService, AdminService],
  exports: [VehiclesService],
})
export class VehiclesModule {}
