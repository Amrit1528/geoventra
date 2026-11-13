/** GEOVENTRA — API keys module.
 *  Registers the API keys controller and service.
 */

import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';
import { AdminService } from '../admin.service.js';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, AdminService],
  exports: [ApiKeysService],
})
export class ApiKeysModule {}
