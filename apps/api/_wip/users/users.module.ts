/**
 * GEOVENTRA — users module.
 *
 * Registers the user controller and service for user lifecycle management.
 */

import { Module } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}