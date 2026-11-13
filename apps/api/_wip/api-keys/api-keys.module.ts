/**
 * GEOVENTRA — API keys module.
 *
 * Registers the API key controller and service.
 */

import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService],
  exports: [ApiKeysService],
  imports: [UsersModule], // Required for user/org scope checks
})
export class ApiKeysModule {}