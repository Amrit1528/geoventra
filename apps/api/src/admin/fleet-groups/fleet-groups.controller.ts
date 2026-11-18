/** GEOVENTRA — fleet groups controller.
 *  Fleet group management endpoints.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { FleetGroupsService } from './fleet-groups.service.js';
import { RequirePermissions } from '../../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { z } from 'zod';

const groupQuerySchema = z.object({
  search: z.string().max(100).optional(),
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(50),
});

const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(200).optional(),
  vehicleIds: z.array(z.string().uuid()).optional(),
  userIds: z.array(z.string().uuid()).optional(),
});

const updateGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(200).optional(),
  vehicleIds: z.array(z.string().uuid()).optional(),
  userIds: z.array(z.string().uuid()).optional(),
  archive: z.boolean().optional(),
});

@Controller('admin/fleet-groups')
export class FleetGroupsController {
  constructor(private readonly fleetGroupsService: FleetGroupsService) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.read')
  async list(@Query() query: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = groupQuerySchema.parse(query);
    return this.fleetGroupsService.listGroups(user.organisationId, parsed);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.read')
  async detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    const data = await this.fleetGroupsService.getGroup(user.organisationId, id);
    if (!data) throw new Error('Fleet group not found');
    return data;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.write')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = createGroupSchema.parse(body);
    const data = await this.fleetGroupsService.createGroup(user.organisationId, parsed);
    return data;
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.write')
  async update(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: AuthenticatedUser) {
    const parsed = updateGroupSchema.parse(body);
    const data = await this.fleetGroupsService.updateGroup(user.organisationId, id, parsed);
    return data;
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('vehicles.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.fleetGroupsService.deleteGroup(user.organisationId, id);
    return {};
  }
}
