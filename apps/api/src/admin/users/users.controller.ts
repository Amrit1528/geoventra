/** GEOVENTRA — users controller.
 *  User management CRUD and lifecycle endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { RequirePermissions } from '../../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { z } from 'zod';

const userQuerySchema = z.object({
  search: z.string().max(100).optional(),
  role: z.string().uuid().optional(),
  status: z.enum(['active', 'invited', 'suspended']).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8),
  roleId: z.string().uuid(),
  phone: z.string().optional(),
  status: z.enum(['active', 'invited', 'suspended']).default('active'),
});

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  roleId: z.string().uuid().optional(),
  status: z.enum(['active', 'invited', 'suspended']).optional(),
  password: z.string().min(8).optional(),
  delete: z.boolean().optional(),
});

@Controller('admin/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = userQuerySchema.parse(query);
    return this.usersService.listUsers(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.usersService.getUser(user.organisationId, id);
    if (!data) throw new Error('User not found');
    return data;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createUserSchema.parse(body);
    const data = await this.usersService.createUser(user.organisationId, parsed);
    return data;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateUserSchema.parse(body);
    if (parsed.delete) {
      await this.usersService.deleteUser(user.organisationId, id);
      return { deleted: true };
    }
    const data = await this.usersService.updateUser(user.organisationId, id, parsed);
    if (!data) throw new Error('User not found');
    return data;
  }

  @Post(':id/assign-role')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  async assignRole(@Param('id') id: string, @Body() body: { roleId: string }, @CurrentUser() user: AuthenticatedUser) {
    await this.usersService.assignRole(user.organisationId, id, body.roleId);
    return { assigned: true };
  }

  @Post(':id/change-password')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  async changePassword(@Param('id') id: string, @Body() body: { password: string }, @CurrentUser() user: AuthenticatedUser) {
    await this.usersService.changePassword(user.organisationId, id, body.password);
    return { changed: true };
  }
}
