/**
 * GEOVENTRA — engine diagnostics controller.
 *
 * Exposes the Phase 5.1 engine API surface:
 *
 *   GET  /api/v1/engine/vehicles                          fleet view with health counters
 *   GET  /api/v1/engine/vehicles/:vehicleId/overview      full diagnostics overview
 *   GET  /api/v1/engine/vehicles/:vehicleId/telemetry     historical telemetry
 *   GET  /api/v1/engine/vehicles/:vehicleId/telemetry/latest
 *   GET  /api/v1/engine/vehicles/:vehicleId/charts        engine health charts
 *   GET  /api/v1/engine/vehicles/:vehicleId/health        engine health snapshot
 *   GET  /api/v1/engine/vehicles/:vehicleId/dtcs          DTC list
 *   GET  /api/v1/engine/vehicles/:vehicleId/timeline      diagnostic event timeline
 *   GET  /api/v1/engine/dtcs/:id                          DTC detail + events
 *   GET  /api/v1/engine/dtcs/:id/freeze-frame             freeze-frame record
 *   POST /api/v1/engine/dtcs/:id/acknowledge              acknowledge a DTC
 *   POST /api/v1/engine/dtcs/:id/resolve                   resolve a DTC
 *   GET  /api/v1/engine/alerts                            engine health alerts
 *   POST /api/v1/engine/alerts/:id/acknowledge             acknowledge an alert
 *   POST /api/v1/engine/ingest                            telemetry ingestion (device key)
 *   POST /api/v1/engine/dtcs/ingest                       DTC ingestion (device key)
 */

import { Body, Controller, Get, Headers, HttpCode, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  engineDtcIngestSchema,
  engineTelemetryIngestSchema,
  type EngineDtc,
  type EngineDtcEvent,
  type EngineDiagnosticsOverview,
  type EngineFreezeFrame,
  type EngineHealthAlert,
  type EngineHealthChart,
  type EngineHealthSnapshot,
  type EngineTelemetryReading,
  type EngineTimelineEntry,
  type EngineVehicleSummary,
} from '@geoventra/contracts';
import { EngineDiagnosticsService, type DtcDetail } from './engine-diagnostics.service.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { Public } from '../common/auth/public.decorator.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { paginate } from '../common/pagination.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { DeviceIngestGuard } from '../common/auth/device-ingest.guard.js';

const listQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(['pending', 'active', 'acknowledged', 'cleared', 'historical']).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  code: z.string().optional(),
  vehicleId: z.string().uuid().optional(),
  kind: z.enum(['dtc', 'alert', 'telemetry', 'device']).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  metric: z.string().optional(),
  metrics: z.string().optional(),
  bucket: z.enum(['raw', 'minute', 'hour', 'day']).optional(),
  limit: z.coerce.number().int().min(1).max(5000).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
  resolved: z
    .enum(['true', 'false', 'open', 'resolved'])
    .transform((value) => value === 'true' || value === 'resolved')
    .optional(),
});

@Controller('engine')
export class EngineDiagnosticsController {
  constructor(
    private readonly engineService: EngineDiagnosticsService,
    private readonly database: DatabaseService,
  ) {}

  // ── Fleet ────────────────────────────────────────────────────────────────

  @Get('vehicles')
  @RequirePermissions('engine.read')
  async listVehicles(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<{ data: EngineVehicleSummary[]; meta: ReturnType<typeof paginate>['meta'] }> {
    const parsed = listQuerySchema.parse(query ?? {});
    const summaries = await this.engineService.listVehicles(user.organisationId, parsed.q);
    return paginate(summaries, { page: parsed.page, pageSize: parsed.pageSize });
  }

  @Get('vehicles/:vehicleId/overview')
  @RequirePermissions('engine.read')
  async overview(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ): Promise<EngineDiagnosticsOverview> {
    return this.engineService.overview(user.organisationId, vehicleId);
  }

  // ── Telemetry ────────────────────────────────────────────────────────────

  @Get('vehicles/:vehicleId/telemetry')
  @RequirePermissions('engine.read')
  async telemetry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<{ data: EngineTelemetryReading[]; meta: ReturnType<typeof paginate>['meta'] }> {
    const parsed = listQuerySchema.parse(query ?? {});
    const rows = await this.engineService.history(user.organisationId, vehicleId, {
      from: parsed.from,
      to: parsed.to,
      metric: parsed.metric,
      metrics: parsed.metrics ? parsed.metrics.split(',').map((value) => value.trim()) : undefined,
      limit: parsed.limit,
      bucket: parsed.bucket,
    });
    return paginate(rows, { page: parsed.page, pageSize: parsed.pageSize });
  }

  @Get('vehicles/:vehicleId/telemetry/latest')
  @RequirePermissions('engine.read')
  async latestTelemetry(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ): Promise<{ data: EngineTelemetryReading[] }> {
    const data = await this.engineService.latestTelemetry(user.organisationId, vehicleId);
    return { data };
  }

  @Get('vehicles/:vehicleId/charts')
  @RequirePermissions('engine.read')
  async charts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<{ data: EngineHealthChart[] }> {
    const parsed = listQuerySchema.parse(query ?? {});
    const data = await this.engineService.charts(user.organisationId, vehicleId, {
      from: parsed.from,
      to: parsed.to,
      metric: parsed.metric,
      metrics: parsed.metrics ? parsed.metrics.split(',').map((value) => value.trim()) : undefined,
      bucket: parsed.bucket,
    });
    return { data };
  }

  @Get('vehicles/:vehicleId/health')
  @RequirePermissions('engine.read')
  async health(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
  ): Promise<EngineHealthSnapshot> {
    return this.engineService.health(user.organisationId, vehicleId);
  }

  // ── DTCs ─────────────────────────────────────────────────────────────────

  @Get('vehicles/:vehicleId/dtcs')
  @RequirePermissions('engine.read')
  async listDtcs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<{ data: EngineDtc[]; meta: ReturnType<typeof paginate>['meta'] }> {
    const parsed = listQuerySchema.parse(query ?? {});
    const rows = await this.engineService.listDtcs(user.organisationId, vehicleId, {
      status: parsed.status,
      severity: parsed.severity,
      code: parsed.code,
    });
    return paginate(rows, { page: parsed.page, pageSize: parsed.pageSize });
  }

  @Get('vehicles/:vehicleId/timeline')
  @RequirePermissions('engine.read')
  async timeline(
    @CurrentUser() user: AuthenticatedUser,
    @Param('vehicleId') vehicleId: string,
    @Query() query: unknown,
  ): Promise<{ data: EngineTimelineEntry[]; meta: ReturnType<typeof paginate>['meta'] }> {
    const parsed = listQuerySchema.parse(query ?? {});
    const rows = await this.engineService.timeline(user.organisationId, vehicleId, {
      from: parsed.from,
      to: parsed.to,
      kind: parsed.kind,
      limit: parsed.limit,
    });
    return paginate(rows, { page: parsed.page, pageSize: parsed.pageSize });
  }

  @Get('dtcs/:id')
  @RequirePermissions('engine.read')
  async getDtc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DtcDetail> {
    return this.engineService.getDtc(user.organisationId, id);
  }

  @Get('dtcs/:id/freeze-frame')
  @RequirePermissions('engine.read')
  async freezeFrame(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EngineFreezeFrame | null> {
    return this.engineService.freezeFrame(user.organisationId, id);
  }

  @Post('dtcs/:id/acknowledge')
  @HttpCode(200)
  @RequirePermissions('engine.write')
  async acknowledgeDtc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DtcDetail> {
    return this.engineService.acknowledgeDtc(user.organisationId, id, user.id);
  }

  @Post('dtcs/:id/resolve')
  @HttpCode(200)
  @RequirePermissions('engine.write')
  async resolveDtc(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<DtcDetail> {
    return this.engineService.resolveDtc(user.organisationId, id, user.id);
  }

  // ── Health alerts ────────────────────────────────────────────────────────

  @Get('alerts')
  @RequirePermissions('engine.read')
  async listAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: unknown,
  ): Promise<{ data: EngineHealthAlert[]; meta: ReturnType<typeof paginate>['meta'] }> {
    const parsed = z
      .object({
        vehicleId: z.string().uuid().optional(),
        severity: z.enum(['info', 'warning', 'critical']).optional(),
        status: z.enum(['open', 'resolved']).optional(),
        resolved: z
          .enum(['true', 'false', 'open', 'resolved'])
          .transform((value) => value === 'true' || value === 'resolved')
          .optional(),
        limit: z.coerce.number().int().min(1).max(5000).optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(200).optional(),
      })
      .strict()
      .parse(query ?? {});
    const resolved =
      parsed.resolved !== undefined
        ? parsed.resolved
        : parsed.status === 'open'
          ? false
          : parsed.status === 'resolved'
            ? true
            : undefined;
    const rows = await this.engineService.listAlerts(user.organisationId, {
      vehicleId: parsed.vehicleId,
      severity: parsed.severity,
      resolved,
    });
    return paginate(rows, { page: parsed.page, pageSize: parsed.pageSize });
  }

  @Post('alerts/:id/acknowledge')
  @HttpCode(200)
  @RequirePermissions('engine.write')
  async acknowledgeAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<EngineHealthAlert> {
    return this.engineService.acknowledgeAlert(user.organisationId, id, user.id);
  }

  // ── Ingestion ────────────────────────────────────────────────────────────

  /**
   * Telemetry ingestion. Authenticated with the shared ingest key (`x-ingest-key`) rather
   * than a user session, because it is called by gateways and simulators.
   */
  @Public()
  @Post('ingest')
  @HttpCode(202)
  async ingestTelemetry(
    @Headers('x-ingest-key') ingestKey: string | undefined,
    @Body() body: unknown,
  ): Promise<{ accepted: number }> {
    DeviceIngestGuard.assertKey(ingestKey);
    const parsed = engineTelemetryIngestSchema.parse(body);
    const organisationId = await this.resolveOrganisationId(parsed.vehicleId);
    const result = await this.engineService.ingestTelemetry(organisationId, parsed);
    return { accepted: result.accepted };
  }

  /** DTC ingestion from an OBD gateway or simulator. */
  @Public()
  @Post('dtcs/ingest')
  @HttpCode(202)
  async ingestDtc(
    @Headers('x-ingest-key') ingestKey: string | undefined,
    @Body() body: unknown,
  ): Promise<{ dtc: EngineDtc; event: EngineDtcEvent }> {
    DeviceIngestGuard.assertKey(ingestKey);
    const parsed = engineDtcIngestSchema.parse(body);
    const organisationId = await this.resolveOrganisationId(parsed.vehicleId);
    return this.engineService.ingestDtc(organisationId, {
      ...parsed,
      freezeFrame: parsed.freezeFrame ?? null,
    });
  }

  /**
   * Resolve the tenant for an ingestion payload.
   *
   * Devices authenticate with a shared key, so the organisation is derived from the vehicle
   * the payload refers to. A vehicle that does not exist is rejected.
   */
  private async resolveOrganisationId(vehicleId: string): Promise<string> {
    const row = await this.database.queryOne<{ organisation_id: string }>(
      'SELECT organisation_id FROM geoventra.vehicles WHERE id = $1',
      [vehicleId],
    );
    if (!row) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found`);
    }
    return row.organisation_id;
  }
}
