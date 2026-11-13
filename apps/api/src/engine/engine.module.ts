/** GEOVENTRA — engine telemetry module.
 *  Registers the engine controller and service.
 */

import { Module } from '@nestjs/common';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  controllers: [EngineController],
  providers: [EngineService, AdminService],
  exports: [EngineService],
})
export class EngineModule {}
