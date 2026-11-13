/**
 * GEOVENTRA — users controller.
 *
 * Exposes the CRUD and lifecycle endpoints for user management, secured by RBAC.
 */

import { Body, Controller, Get, Post, Patch, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { UserSummary } from '@geoventra/contracts';
import type { Paginated } from '@geoventra/contracts';
import type { RoleName, UserStatus } from '@geoventra/contracts';
import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { AuthUser } from '@geoventra/contracts';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { UsersService } from './users.service.js';

// Schemas for validation
const findUsersSchema = z.object({
  search: z.string().optional(),
  role: z.nativeEnum(RoleName).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  fleetId: z.string().optional(),
  page: z.number().min(1),
  pageSize: z.number().min(1).max(100),
});

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(1),
  roleId: z.string(), // Needs lookup against existing roles
  organisationId: z.string(),
  fleetId: z.string().optional(),
  isInvitation: z.boolean().default(true),
});

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** List all users, filterable by criteria. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.read')
  @ApiOperation({ summary: 'List all users in the organization' })
  @ApiResponse({ status: 200, type: Paginated, description: 'Paginated list of users' })
  async listUsers(@Body() body: unknown): Promise<Paginated<UserSummary>> {
    const parsed = findUsersSchema.parse(body);
    return this.usersService.findAllUsers(parsed);
  }

  /** Create a new user, handling invitation logic. */
  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Create a new user and optionally send an invitation' })
  @ApiResponse({ status: 201, type: UserSummary, description: 'The newly created user summary' })
  async createUser(@Body() body: unknown): Promise<UserSummary> {
    const parsed = createUserSchema.parse(body);
    return this.usersService.createUser(parsed);
  }

  /** Update an existing user's profile, role, or status. */
  @Patch(':userId/profile')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('users.write')
  @ApiOperation({ summary: 'Update a user profile or status' })
  @ApiResponse({ status: 200, type: UserSummary, description: 'The updated user summary' })
  async updateUser(@Param('userId') userId: string, @Body() body: unknown): Promise<UserSummary> {
    // Use a flexible payload for updates (name, phone, roleId, status, etc.)
    // Requires runtime validation to ensure fields are valid according to domain.ts
    // For simplicity, we assume a general update object here.
    const updates = { /* ... parse and validate updates from body ... */ }; // Placeholder
    return this.usersService.updateUser(userId, updates);
  }
}