/** GEOVENTRA — roles controller.
 *  Role and permission management endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { RequirePermissions } from '../../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { z } from 'zod';

const roleQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.number().min(1).default(1),
  pageSize: z.number().min(1).max(100).default(50),
});

const createRoleSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string().max(50)).optional(),
});

const updateRoleSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(200).optional(),
  permissions: z.array(z.string().max(50)).optional(),
});

@Controller('admin/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = roleQuerySchema.parse(query);
    return this.rolesService.listRoles(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.rolesService.getRole(user.organisationId, id);
    if (!data) throw new Error('Role not found');
    return data;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createRoleSchema.parse(body);
    const data = await this.rolesService.createRole(user.organisationId, parsed);
    return data;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateRoleSchema.parse(body);
    const data = await this.rolesService.updateRole(user.organisationId, id, parsed);
    if (!data) throw new Error('Role not found');
    return data;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.rolesService.deleteRole(user.organisationId, id);
    return {};
  }
}
