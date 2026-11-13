/**
 * GEOVENTRA — fleet groups controller.
 *
 * Exposes API endpoints for fleet group management, secured by RBAC.
 */

import { Body, Controller, Get, Post, Patch, UseGuards, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { FleetGroupsService } from './fleet-groups.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { FleetGroup } from '@geoventra/contracts';
import type { Paginated } from '@geoventra/contracts';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { UsersService } from '../users/users.service.js';

@Controller('fleet-groups')
export class FleetGroupsController {
  constructor(
    private readonly fleetGroupsService: FleetGroupsService,
    private readonly usersService: UsersService,
  ) {}

  /** List all fleet groups within the organization. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('fleetgroups.read')
  @ApiOperation({ summary: 'List all fleet groups' })
  @ApiResponse({ status: 200, type: Paginated<FleetGroup>, description: 'List of fleet groups' })
  async listFleetGroups(@CurrentUser() user: AuthenticatedUser): Promise<Paginated<FleetGroup>> {
    // Currently only returns a list, assuming pagination is implemented in the service eventually.
    return this.fleetGroupsService.findAllFleetGroups(user.organisationId);
  }

  /** Create a new fleet group. */
  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('fleetgroups.write')
  @ApiOperation({ summary: 'Create a new fleet group' })
  @ApiResponse({ status: 201, type: FleetGroup, description: 'The created fleet group' })
  async createFleetGroup(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<FleetGroup> {
    // Payload validation (using Zod/class-validator) should occur here
    const name = body.name as string;
    const description = body.description as string | null;
    const color = body.color as string;
    return this.fleetGroupsService.createFleetGroup(user.organisationId, name, description, color);
  }

  /** Assign a vehicle to a specific fleet group. */
  @Patch(':groupId/vehicles/:vehicleId/assign')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('fleetgroups.write')
  @ApiOperation({ summary: 'Assign a vehicle to a fleet group' })
  @ApiResponse({ status: 200, type: FleetGroup, description: 'The updated fleet group' })
  async assignVehicle(@Param('groupId') groupId: string, @Param('vehicleId') vehicleId: string) {
    // NOTE: Vehicle existence check should ideally run against a VehicleService.
    return this.fleetGroupsService.assignVehicleToGroup(groupId, vehicleId);
  }
}