/**
 * GEOVENTRA — API key controller.
 *
 * Exposes API endpoints for API key management, secured by RBAC.
 */

import { Body, Controller, Get, Post, Delete, UseGuards, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { ApiOkResponse, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { ApiKeySummary, ApiKeyCreated } from '@geoventra/contracts';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { UsersService } from '../users/users.service.js';

@Controller('api-keys')
export class ApiKeysController {
  constructor(
    private readonly apiKeysService: ApiKeysService,
    private readonly usersService: UsersService,
  ) {}

  /** Create a new API key for the organization. */
  @Post()
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('apikeys.write')
  @ApiOperation({ summary: 'Create a new secure API key' })
  @ApiResponse({ status: 201, type: ApiKeyCreated, description: 'The generated key, including the one-time secret.' })
  async createApiKey(@CurrentUser() user: AuthenticatedUser, @Body() body: unknown): Promise<ApiKeyCreated> {
    // Payload validation (using Zod/class-validator) should occur here
    const name = body.name as string;
    const scopes = body.scopes as string[];
    const expiry = body.expiry as Date | null;
    return this.apiKeysService.createApiKey(user.organisationId, name, scopes, expiry);
  }

  /** Retrieve an API key summary. */
  @Get(':keyId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('apikeys.read')
  @ApiOperation({ summary: 'Get details of a specific API key' })
  @ApiResponse({ status: 200, type: ApiKeySummary, description: 'API Key summary' })
  async getApiKey(@Param('keyId') keyId: string, @CurrentUser() user: AuthenticatedUser): Promise<ApiKeySummary> {
    return this.apiKeysService.findApiKeyById(user.organisationId, keyId);
  }

  /** Revoke an API key. */
  @Delete(':keyId')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('apikeys.write')
  @ApiOperation({ summary: 'Revoke (revoke_at = now()) an API key' })
  @ApiResponse({ status: 204, description: 'Key revoked successfully' })
  async revokeApiKey(@Param('keyId') keyId: string, @CurrentUser() user: AuthenticatedUser) {
    await this.apiKeysService.revokeApiKey(user.organisationId, keyId);
  }
}