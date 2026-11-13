/**
 * GEOVENTRA — authentication module.
 *
 * Registers the global guards so every route is authenticated unless explicitly marked
 * `@Public()`, and exposes the auth controller.
 */

import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { PermissionsGuard } from '../common/auth/permissions.guard.js';
import { PasswordService } from '../common/auth/password.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AuthService, PasswordService],
})
export class AuthModule {}
