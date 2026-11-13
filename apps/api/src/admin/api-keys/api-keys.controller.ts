/** GEOVENTRA — API keys controller.
 *  API key management endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service.js';
import { RequirePermissions } from '../../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { z } from 'zod';

const keyQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

const createKeySchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.string().max(100)).optional(),
  expiresAt: z.string().datetime().optional(),
});

@Controller('admin/api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = keyQuerySchema.parse(query);
    return this.apiKeysService.listKeys(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.apiKeysService.getKey(user.organisationId, id);
    if (!data) throw new Error('API key not found');
    return data;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createKeySchema.parse(body);
    const data = await this.apiKeysService.createKey(user.organisationId, { ...parsed, scopes: parsed.scopes || [] });
    return data;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = z.object({
      name: z.string().min(1).max(100).optional(),
      scopes: z.array(z.string().max(100)).optional(),
      revoke: z.boolean().optional(),
    }).parse(body);

    if (parsed.revoke) {
      await this.apiKeysService.revokeKey(user.organisationId, id);
      return { revoked: true };
    }
    const data = await this.apiKeysService.updateKey(user.organisationId, id, parsed);
    return data;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('settings.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.apiKeysService.revokeKey(user.organisationId, id);
    return {};
  }
}
