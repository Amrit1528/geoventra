/**
 * GEOVENTRA — authentication controller.
 *
 * Exposes the login/refresh/logout/me surface described by the platform contract.
 */

import { Body, Controller, Get, HttpCode, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import type { AuthSession, AuthUser } from '@geoventra/contracts';
import { AuthService } from './auth.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { Public } from '../common/auth/public.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(160).optional(),
  phone: z.string().max(40).nullable().optional(),
  avatarUrl: z.string().url().nullable().optional(),
});

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly database: DatabaseService,
  ) {}

  /** Exchange credentials for an access + refresh token pair. */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown): Promise<AuthSession> {
    const parsed = loginSchema.parse(body);
    return this.authService.login(parsed.email, parsed.password);
  }

  /** Rotate a refresh token and issue a new access token. */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Body() body: unknown): Promise<AuthSession> {
    const parsed = refreshSchema.parse(body);
    return this.authService.refresh(parsed.refreshToken);
  }

  /** Revoke the supplied refresh token. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Body() body: unknown): Promise<void> {
    const parsed = z.object({ refreshToken: z.string().optional() }).parse(body ?? {});
    await this.authService.logout(parsed.refreshToken);
  }

  /** The signed-in principal. */
  @Get('me')
  @RequirePermissions('dashboard.read')
  async me(@CurrentUser() user: AuthenticatedUser): Promise<AuthUser> {
    return this.authService.resolveUser(user.id);
  }

  /** Update the signed-in principal's profile. */
  @Patch('me')
  @RequirePermissions('dashboard.read')
  async updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ): Promise<AuthUser> {
    const parsed = updateProfileSchema.parse(body ?? {});
    const sets: string[] = [];
    const values: unknown[] = [];
    if (parsed.name !== undefined) {
      values.push(parsed.name);
      sets.push(`name = $${values.length}`);
    }
    if (parsed.phone !== undefined) {
      values.push(parsed.phone);
      sets.push(`phone = $${values.length}`);
    }
    if (parsed.avatarUrl !== undefined) {
      values.push(parsed.avatarUrl);
      sets.push(`avatar_url = $${values.length}`);
    }
    if (sets.length > 0) {
      values.push(user.id);
      await this.database.query(
        `UPDATE geoventra.users SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`,
        values,
      );
    }
    return this.authService.resolveUser(user.id);
  }
}
