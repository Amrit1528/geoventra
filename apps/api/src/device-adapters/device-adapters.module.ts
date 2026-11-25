import { Module } from '@nestjs/common';
import { DeviceAdaptersController } from './device-adapters.controller.js';
import { DeviceAdaptersService } from './device-adapters.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { Pt06Module } from '../pt06/pt06.module.js';
import { Ps10Module } from '../ps10/ps10.module.js';

@Module({
  imports: [Pt06Module, Ps10Module],
  controllers: [DeviceAdaptersController],
  providers: [DeviceAdaptersService, DatabaseService],
})
export class DeviceAdaptersModule {}
