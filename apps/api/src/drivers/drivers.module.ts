import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller.js';
import { DriversService } from './drivers.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({ controllers: [DriversController], providers: [DriversService, AdminService], exports: [DriversService] })
export class DriversModule {}
