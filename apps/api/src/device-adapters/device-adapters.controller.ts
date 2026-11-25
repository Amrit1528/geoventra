import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { DeviceAdaptersService } from './device-adapters.service.js';

interface OrgRequest {
  user: { organisationId: string };
}

type AuditQuery = {
  limit?: string;
  outcome?: string;
  source?: string;
  deviceId?: string;
  manufacturerId?: string;
  modelId?: string;
  from?: string;
  to?: string;
};

@Controller('device-adapters')
@UseGuards(JwtAuthGuard)
export class DeviceAdaptersController {
  constructor(@Inject(DeviceAdaptersService) private readonly svc: DeviceAdaptersService) {}

  @Get('health')
  @RequirePermissions('devices.read')
  health(@Req() req: OrgRequest) {
    return this.svc.adapterHealth(req.user.organisationId);
  }

  @Get('manufacturers')
  @RequirePermissions('devices.read')
  manufacturers(@Req() req: OrgRequest) {
    return this.svc.listManufacturers(req.user.organisationId);
  }

  @Post('manufacturers')
  @RequirePermissions('devices.write')
  createManufacturer(@Req() req: OrgRequest, @Body() body: Record<string, unknown>) {
    return this.svc.createManufacturer(req.user.organisationId, body ?? {});
  }

  @Patch('manufacturers/:id')
  @RequirePermissions('devices.write')
  updateManufacturer(@Req() req: OrgRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updateManufacturer(req.user.organisationId, id, body ?? {});
  }

  @Delete('manufacturers/:id')
  @RequirePermissions('devices.write')
  deleteManufacturer(@Req() req: OrgRequest, @Param('id') id: string) {
    return this.svc.deleteManufacturer(req.user.organisationId, id);
  }

  @Get('models')
  @RequirePermissions('devices.read')
  models(@Req() req: OrgRequest, @Query('manufacturerId') manufacturerId?: string) {
    return this.svc.listModels(req.user.organisationId, manufacturerId);
  }

  @Post('models')
  @RequirePermissions('devices.write')
  createModel(@Req() req: OrgRequest, @Body() body: Record<string, unknown>) {
    return this.svc.createModel(req.user.organisationId, body ?? {});
  }

  @Patch('models/:id')
  @RequirePermissions('devices.write')
  updateModel(@Req() req: OrgRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updateModel(req.user.organisationId, id, body ?? {});
  }

  @Delete('models/:id')
  @RequirePermissions('devices.write')
  deleteModel(@Req() req: OrgRequest, @Param('id') id: string) {
    return this.svc.deleteModel(req.user.organisationId, id);
  }

  @Get('models/:id/capabilities')
  @RequirePermissions('devices.read')
  capabilities(@Req() req: OrgRequest, @Param('id') id: string) {
    return this.svc.listCapabilities(req.user.organisationId, id);
  }

  @Post('models/:id/capabilities')
  @RequirePermissions('devices.write')
  createCapability(@Req() req: OrgRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.createCapability(req.user.organisationId, id, body ?? {});
  }

  @Get('capabilities')
  @RequirePermissions('devices.read')
  allCapabilities(@Req() req: OrgRequest) {
    return this.svc.listCapabilities(req.user.organisationId);
  }

  @Patch('capabilities/:id')
  @RequirePermissions('devices.write')
  updateCapability(@Req() req: OrgRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updateCapability(req.user.organisationId, id, body ?? {});
  }

  @Delete('capabilities/:id')
  @RequirePermissions('devices.write')
  deleteCapability(@Req() req: OrgRequest, @Param('id') id: string) {
    return this.svc.deleteCapability(req.user.organisationId, id);
  }

  @Get('field-mappings')
  @RequirePermissions('devices.read')
  fieldMappings(
    @Req() req: OrgRequest,
    @Query('manufacturerId') manufacturerId?: string,
    @Query('modelId') modelId?: string,
  ) {
    return this.svc.listFieldMappings(req.user.organisationId, manufacturerId, modelId);
  }

  @Post('field-mappings')
  @RequirePermissions('devices.write')
  createFieldMapping(@Req() req: OrgRequest, @Body() body: Record<string, unknown>) {
    return this.svc.createFieldMapping(req.user.organisationId, body ?? {});
  }

  @Patch('field-mappings/:id')
  @RequirePermissions('devices.write')
  updateFieldMapping(@Req() req: OrgRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updateFieldMapping(req.user.organisationId, id, body ?? {});
  }

  @Delete('field-mappings/:id')
  @RequirePermissions('devices.write')
  deleteFieldMapping(@Req() req: OrgRequest, @Param('id') id: string) {
    return this.svc.deleteFieldMapping(req.user.organisationId, id);
  }

  @Get('integration-configs')
  @RequirePermissions('devices.read')
  integrationConfigs(
    @Req() req: OrgRequest,
    @Query('manufacturerId') manufacturerId?: string,
    @Query('modelId') modelId?: string,
    @Query('enabled') enabled?: string,
  ) {
    return this.svc.listIntegrationConfigs(req.user.organisationId, { manufacturerId, modelId, enabled });
  }

  @Post('integration-configs')
  @RequirePermissions('devices.write')
  createIntegrationConfig(@Req() req: OrgRequest, @Body() body: Record<string, unknown>) {
    return this.svc.createIntegrationConfig(req.user.organisationId, body ?? {});
  }

  @Patch('integration-configs/:id')
  @RequirePermissions('devices.write')
  updateIntegrationConfig(@Req() req: OrgRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.svc.updateIntegrationConfig(req.user.organisationId, id, body ?? {});
  }

  @Delete('integration-configs/:id')
  @RequirePermissions('devices.write')
  deleteIntegrationConfig(@Req() req: OrgRequest, @Param('id') id: string) {
    return this.svc.deleteIntegrationConfig(req.user.organisationId, id);
  }

  @Get('connection-status')
  @RequirePermissions('devices.read')
  connectionStatus(
    @Req() req: OrgRequest,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.svc.listConnectionStatus(req.user.organisationId, { status, search });
  }

  @Get('ingestion-audit')
  @RequirePermissions('devices.read')
  ingestionAudit(@Req() req: OrgRequest, @Query() query: AuditQuery) {
    return this.svc.listIngestionAudit(req.user.organisationId, {
      ...query,
      limit: query.limit ? Number(query.limit) : undefined,
    });
  }
}
