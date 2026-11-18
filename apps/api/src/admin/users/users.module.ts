/** GEOVENTRA — users module.
 *  Registers the users controller and service.
 */

import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { AdminService } from '../admin.service.js';
import { PasswordService } from '../../common/auth/password.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService, AdminService, PasswordService],
  exports: [UsersService],
})
export class UsersModule {}
