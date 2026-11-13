/** GEOVENTRA — vehicle telemetry controller.
 *  Unified vehicle telemetry aggregation endpoint.
 */

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { VehicleTelemetryService } from './vehicle-telemetry.service.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';

@Controller('telemetry')
export class VehicleTelemetryController {
  constructor(private readonly telemetryService: VehicleTelemetryService) {}

  @Get('vehicles/:vehicleId/summary')
  @UseGuards(JwtAuthGuard)
  @RequirePermissions('tracking.read')
  async getVehicleTelemetrySummary(@Param('vehicleId') vehicleId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.telemetryService.getVehicleTelemetrySummary(user.organisationId, vehicleId);
  }
}
