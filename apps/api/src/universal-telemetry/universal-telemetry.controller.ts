import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { UniversalTelemetryService } from './universal-telemetry.service.js';

interface OrgRequest {
  user: { organisationId: string };
}

@Controller('universal-telemetry')
@UseGuards(JwtAuthGuard)
export class UniversalTelemetryController {
  constructor(private readonly svc: UniversalTelemetryService) {}

  @Post('ingest/:deviceId')
  @RequirePermissions('devices.write')
  async ingest(@Req() req: OrgRequest, @Param('deviceId') deviceId: string, @Body() body: unknown) {
    const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    const source = typeof payload.source === 'string' ? payload.source : 'api';
    const data = { ...payload };
    delete data.source;
    return this.svc.ingestRaw(req.user.organisationId, deviceId, data, source);
  }

  @Get('capabilities')
  @RequirePermissions('devices.read')
  async capabilities() {
    return this.svc.listCapabilityCatalog();
  }

  @Get('devices/:deviceId/capabilities')
  @RequirePermissions('devices.read')
  async deviceCapabilities(@Req() req: OrgRequest, @Param('deviceId') deviceId: string) {
    return this.svc.getDeviceCapabilities(req.user.organisationId, deviceId);
  }
}
