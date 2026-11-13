/**
 * GEOVENTRA — engine diagnostics service.
 *
 * Orchestrates the Phase 5.1 engine feature set:
 *
 *   • real-time telemetry ingestion and the latest-value snapshot
 *   • DTC lifecycle management (detect → acknowledge → resolve, with re-occurrence handling)
 *   • freeze-frame capture at the moment a fault is raised
 *   • historical diagnostics (time-bucketed series and raw readings)
 *   • the diagnostic event timeline (DTC events + alerts + telemetry markers)
 *   • engine health scoring and the chart series that back it
 *
 * Every read is tenant-scoped by `organisationId`; every write emits a realtime event.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ENGINE_PRIMARY_METRICS,
  type DtcSeverity,
  type DtcStatus,
  type EngineDtc,
  type EngineDtcEvent,
  type EngineDiagnosticsOverview,
  type EngineFreezeFrame,
  type EngineHealthAlert,
  type EngineHealthChart,
  type EngineHealthSnapshot,
  type EngineMetricPoint,
  type EngineTelemetryReading,
  type EngineTimelineEntry,
  type EngineVehicleSummary,
  type SourceClassification,
} from '@geoventra/contracts';
import {
  EngineDiagnosticsRepository,
  type HistoryQuery,
} from './engine-diagnostics.repository.js';
import { EngineEventsService } from './engine-events.service.js';
import {
  ENGINE_HEALTH_RULES,
  evaluateEngineRules,
} from './engine-health.rules.js';
import { computeEngineHealthScore } from './engine-health-score.js';
import { isLiveDtc, transitionDtc } from './engine-dtc.lifecycle.js';


export interface EngineIngestTelemetryCommand {
  vehicleId: string;
  deviceId?: string | null;
  readings: Array<{
    metric: string;
    pid?: string | null;
    value: number;
    unit: string;
    recordedAt?: string | null;
    sourceClassification?: SourceClassification;
    dataQuality?: 'good' | 'uncertain' | 'invalid';
    protocolMetadata?: Record<string, unknown>;
    // --- FUEL EXTENSIONS ---
    fuelLevel?: number | null;
    fuelPercentage?: number | null;
    tankCapacity?: number | null;
    fuelConsumptionRate?: number | null;
    odometerKm?: number | null;
    gpsLatitude?: number | null;
    gpsLongitude?: number | null;
    ignition?: boolean | null;
  }>;
}

export interface EngineIngestDtcCommand {
  vehicleId: string;
  deviceId?: string | null;
  code: string;
  category?: string;
  description?: string | null;
  severity?: DtcSeverity;
  milOn?: boolean;
  detectedAt?: string | null;
  /** Loose freeze-frame input; normalised by the service before persistence. */
  freezeFrame?: {
    capturedAt?: string | undefined;
    source?: 'dtc_trigger' | 'manual' | 'scheduled' | undefined;
    metrics: Record<string, number>;
    vehicleState?: {
      speedKph?: number | null | undefined;
      rpm?: number | null | undefined;
      loadPct?: number | null | undefined;
      coolantTempC?: number | null | undefined;
      fuelLevelPct?: number | null | undefined;
      ignition?: boolean | null | undefined;
      odometerKm?: number | null | undefined;
      latitude?: number | null | undefined;
      longitude?: number | null | undefined;
      heading?: number | null | undefined;
    } | null;
  } | null;
}

export interface DtcDetail extends EngineDtc {
  events: EngineDtcEvent[];
}

@Injectable()
export class EngineDiagnosticsService {
  private readonly logger = new Logger(EngineDiagnosticsService.name);

  constructor(
    private readonly repository: EngineDiagnosticsRepository,
    private readonly events: EngineEventsService,
  ) {}

  // ── Fleet overview ───────────────────────────────────────────────────────

  /** Vehicles with an engine surface, annotated with their diagnostics counters. */
  async listVehicles(organisationId: string, search?: string): Promise<EngineVehicleSummary[]> {
    const vehicles = await this.repository.listVehicles(organisationId, search);
    if (vehicles.length === 0) return [];

    const vehicleIds = vehicles.map((vehicle) => vehicle.vehicle_id);
    const dtcs = await this.repository.listDtcs(organisationId, null, {});
    const alerts = await this.repository.listAlerts(organisationId, { resolved: false });

    const dtcByVehicle = new Map<string, EngineDtc[]>();
    for (const dtc of dtcs) {
      const list = dtcByVehicle.get(dtc.vehicleId) ?? [];
      list.push(dtc);
      dtcByVehicle.set(dtc.vehicleId, list);
    }

    const alertsByVehicle = new Map<string, EngineHealthAlert[]>();
    for (const alert of alerts) {
      const list = alertsByVehicle.get(alert.vehicleId) ?? [];
      list.push(alert);
      alertsByVehicle.set(alert.vehicleId, list);
    }

    const summaries: EngineVehicleSummary[] = [];
    const readingsByVehicle = await this.repository.latestTelemetryForVehicles(
      organisationId,
      vehicleIds,
    );
    for (const vehicle of vehicles) {
      const vehicleDtcs = dtcByVehicle.get(vehicle.vehicle_id) ?? [];
      const vehicleAlerts = alertsByVehicle.get(vehicle.vehicle_id) ?? [];
      const liveDtcs = vehicleDtcs.filter((dtc) => isLiveDtc(dtc));
      const readings = readingsByVehicle.get(vehicle.vehicle_id) ?? [];
      const health = this.computeHealthSnapshot(vehicle.vehicle_id, liveDtcs, vehicleAlerts, readings);

      summaries.push({
        vehicleId: vehicle.vehicle_id,
        registrationNumber: vehicle.registration_number,
        name: vehicle.name,
        category: vehicle.category,
        status: vehicle.status,
        healthStatus: health.healthStatus,
        healthScore: health.healthScore,
        milOn: liveDtcs.some((dtc) => dtc.milOn),
        activeDtcCount: liveDtcs.length,
        totalDtcCount: vehicleDtcs.length,
        openAlertCount: vehicleAlerts.length,
        criticalAlertCount: vehicleAlerts.filter((alert) => alert.severity === 'critical').length,
        lastReadingAt: health.lastReadingAt,
        deviceId: vehicle.device_id,
        deviceStatus: vehicle.device_status as EngineVehicleSummary['deviceStatus'],
      });
    }

    return summaries;
  }

  // ── Overview ─────────────────────────────────────────────────────────────

  async overview(organisationId: string, vehicleId: string): Promise<EngineDiagnosticsOverview> {
    const vehicle = await this.repository.findVehicle(organisationId, vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${vehicleId} was not found`);
    }

    const allDtcs = await this.repository.listDtcs(organisationId, vehicleId, {});
    const liveDtcs = allDtcs.filter((dtc) => isLiveDtc(dtc));
    const alerts = await this.repository.listAlerts(organisationId, {
      vehicleId,
      resolved: false,
    });
    const health = await this.computeHealth(organisationId, vehicleId, liveDtcs, alerts);
    const latestTelemetry = await this.repository.latestTelemetry(organisationId, vehicleId);

    const dtcCounts: Record<DtcStatus, number> = {
      pending: 0,
      active: 0,
      acknowledged: 0,
      cleared: 0,
      historical: 0,
    };
    for (const dtc of allDtcs) {
      dtcCounts[dtc.status] = (dtcCounts[dtc.status] ?? 0) + 1;
    }

    const recentEvents: EngineDtcEvent[] = [];
    for (const dtc of allDtcs.slice(0, 5)) {
      const events = await this.repository.listDtcEvents(organisationId, dtc.id);
      recentEvents.push(...events);
    }
    recentEvents.sort(
      (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
    );

    const summary: EngineVehicleSummary = {
      vehicleId,
      registrationNumber: vehicle.registration_number,
      name: vehicle.name,
      category: vehicle.category,
      status: vehicle.status,
      healthStatus: health.healthStatus,
      healthScore: health.healthScore,
      milOn: liveDtcs.some((dtc) => dtc.milOn),
      activeDtcCount: liveDtcs.length,
      totalDtcCount: allDtcs.length,
      openAlertCount: alerts.length,
      criticalAlertCount: alerts.filter((alert) => alert.severity === 'critical').length,
      lastReadingAt: health.lastReadingAt,
      deviceId: vehicle.device_id,
      deviceStatus: vehicle.device_status as EngineVehicleSummary['deviceStatus'],
    };

    return {
      vehicle: summary,
      health,
      latestTelemetry,
      dtcCounts,
      recentEvents: recentEvents.slice(0, 25),
      openAlerts: alerts.slice(0, 25),
      generatedAt: new Date().toISOString(),
    };
  }

  // ── Telemetry ────────────────────────────────────────────────────────────

  async latestTelemetry(
    organisationId: string,
    vehicleId: string,
  ): Promise<EngineTelemetryReading[]> {
    return this.repository.latestTelemetry(organisationId, vehicleId);
  }

  async history(
    organisationId: string,
    vehicleId: string,
    query: HistoryQuery,
  ): Promise<EngineTelemetryReading[]> {
    return this.repository.listTelemetry(organisationId, vehicleId, query);
  }

  // ── Charts ───────────────────────────────────────────────────────────────

  /** Time-bucketed series per metric, with the rule threshold attached when known. */
  async charts(
    organisationId: string,
    vehicleId: string,
    query: HistoryQuery,
  ): Promise<EngineHealthChart[]> {
    const series = await this.repository.chartSeries(organisationId, vehicleId, query);
    const byMetric = new Map<string, EngineHealthChart>();

    for (const row of series) {
      const chart = byMetric.get(row.metric) ?? {
        metric: row.metric,
        unit: row.unit,
        points: [],
        min: null,
        max: null,
        avg: null,
        latest: null,
        threshold: null,
      };
      chart.points.push({ t: row.bucket.toISOString(), value: Number(row.value) });
      byMetric.set(row.metric, chart);
    }

    for (const chart of byMetric.values()) {
      const values = chart.points.map((point) => point.value);
      chart.min = values.length ? Math.min(...values) : null;
      chart.max = values.length ? Math.max(...values) : null;
      chart.avg = values.length
        ? values.reduce((total, value) => total + value, 0) / values.length
        : null;
      chart.latest = values.length ? (values[values.length - 1] ?? null) : null;
      const rule = findRuleForMetric(chart.metric);
      chart.threshold = rule ? rule.threshold : null;
    }

    const ordered = [...byMetric.values()].sort((a, b) => {
      const aIndex = (ENGINE_PRIMARY_METRICS as readonly string[]).indexOf(a.metric);
      const bIndex = (ENGINE_PRIMARY_METRICS as readonly string[]).indexOf(b.metric);
      if (aIndex === -1 && bIndex === -1) return a.metric.localeCompare(b.metric);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return ordered;
  }

  // ── Health ───────────────────────────────────────────────────────────────

  async health(organisationId: string, vehicleId: string): Promise<EngineHealthSnapshot> {
    const dtcs = (await this.repository.listDtcs(organisationId, vehicleId, {})).filter((dtc) =>
      isLiveDtc(dtc),
    );
    const alerts = await this.repository.listAlerts(organisationId, {
      vehicleId,
      resolved: false,
    });
    const health = await this.computeHealth(organisationId, vehicleId, dtcs, alerts);
    const charts = await this.charts(organisationId, vehicleId, {});
    return { ...health, charts };
  }

  // ── DTC lifecycle ────────────────────────────────────────────────────────

  async listDtcs(
    organisationId: string,
    vehicleId: string | null,
    filters: { status?: DtcStatus; severity?: DtcSeverity; code?: string },
  ): Promise<EngineDtc[]> {
    return this.repository.listDtcs(organisationId, vehicleId, filters);
  }

  async getDtc(organisationId: string, dtcId: string): Promise<DtcDetail> {
    const dtc = await this.repository.findDtc(organisationId, dtcId);
    if (!dtc) {
      throw new NotFoundException(`DTC ${dtcId} was not found`);
    }
    const events = await this.repository.listDtcEvents(organisationId, dtcId);
    return { ...dtc, events };
  }

  /** The freeze frame captured when the fault was raised. */
  async freezeFrame(organisationId: string, dtcId: string): Promise<EngineFreezeFrame | null> {
    const dtc = await this.repository.findDtc(organisationId, dtcId);
    if (!dtc) {
      throw new NotFoundException(`DTC ${dtcId} was not found`);
    }
    return dtc.freezeFrame;
  }

  async acknowledgeDtc(organisationId: string, dtcId: string, userId: string): Promise<DtcDetail> {
    const dtc = await this.repository.findDtc(organisationId, dtcId);
    if (!dtc) {
      throw new NotFoundException(`DTC ${dtcId} was not found`);
    }

    const transition = transitionDtc({
      current: dtc,
      action: 'acknowledge',
      severity: dtc.severity,
      milOn: dtc.milOn,
    });

    const updated = await this.repository.updateDtc(organisationId, dtcId, {
      status: transition.status,
      acknowledged: transition.acknowledged,
      acknowledgedAt: new Date().toISOString(),
      acknowledgedBy: userId,
    });
    if (!updated) {
      throw new NotFoundException(`DTC ${dtcId} was not found`);
    }

    const event = await this.repository.insertDtcEvent(
      organisationId,
      updated.vehicleId,
      updated.id,
      updated.code,
      transition.eventType,
      new Date().toISOString(),
      { acknowledgedBy: userId },
    );

    this.events.publish({
      type: 'engine.dtc',
      vehicleId: updated.vehicleId,
      dtc: updated,
      event,
      emittedAt: new Date().toISOString(),
    });

    const events = await this.repository.listDtcEvents(organisationId, dtcId);
    return { ...updated, events };
  }

  async resolveDtc(organisationId: string, dtcId: string, userId: string): Promise<DtcDetail> {
    const dtc = await this.repository.findDtc(organisationId, dtcId);
    if (!dtc) {
      throw new NotFoundException(`DTC ${dtcId} was not found`);
    }

    const transition = transitionDtc({
      current: dtc,
      action: 'resolve',
      severity: dtc.severity,
      milOn: dtc.milOn,
    });

    const freezeFrame = transition.captureFreezeFrame
      ? await this.captureFreezeFrame(organisationId, dtc.vehicleId)
      : dtc.freezeFrame;

    const updated = await this.repository.updateDtc(organisationId, dtcId, {
      status: transition.status,
      resolved: transition.resolved,
      resolvedAt: new Date().toISOString(),
      resolvedBy: userId,
      milOn: transition.milOn,
      freezeFrame,
    });
    if (!updated) {
      throw new NotFoundException(`DTC ${dtcId} was not found`);
    }

    const event = await this.repository.insertDtcEvent(
      organisationId,
      updated.vehicleId,
      updated.id,
      updated.code,
      transition.eventType,
      new Date().toISOString(),
      { resolvedBy: userId },
    );

    this.events.publish({
      type: 'engine.dtc',
      vehicleId: updated.vehicleId,
      dtc: updated,
      event,
      emittedAt: new Date().toISOString(),
    });

    await this.evaluateVehicleAlerts(organisationId, updated.vehicleId);

    const events = await this.repository.listDtcEvents(organisationId, dtcId);
    return { ...updated, events };
  }

  // ── Health alerts ────────────────────────────────────────────────────────

  async listAlerts(
    organisationId: string,
    filters: { vehicleId?: string; severity?: EngineHealthAlert['severity']; resolved?: boolean },
  ): Promise<EngineHealthAlert[]> {
    return this.repository.listAlerts(organisationId, filters);
  }

  async acknowledgeAlert(
    organisationId: string,
    alertId: string,
    userId: string,
  ): Promise<EngineHealthAlert> {
    const alert = await this.repository.acknowledgeAlert(organisationId, alertId, userId);
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} was not found`);
    }
    this.events.publish({
      type: 'engine.alert',
      vehicleId: alert.vehicleId,
      alert,
      emittedAt: new Date().toISOString(),
    });
    return alert;
  }

  async resolveAlert(
    organisationId: string,
    alertId: string,
    userId: string | null,
  ): Promise<EngineHealthAlert> {
    const alert = await this.repository.resolveAlert(organisationId, alertId, userId);
    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} was not found`);
    }
    this.events.publish({
      type: 'engine.alert',
      vehicleId: alert.vehicleId,
      alert,
      emittedAt: new Date().toISOString(),
    });
    return alert;
  }

  // ── Timeline ─────────────────────────────────────────────────────────────

  async timeline(
    organisationId: string,
    vehicleId: string,
    filters: { from?: string; to?: string; kind?: string; limit?: number },
  ): Promise<EngineTimelineEntry[]> {
    return this.repository.listTimeline(organisationId, vehicleId, filters);
  }

  // ── Ingestion ────────────────────────────────────────────────────────────

  /** Persist a batch of engine telemetry, evaluate the health rules and publish the update. */
  async ingestTelemetry(
    organisationId: string,
    command: EngineIngestTelemetryCommand,
  ): Promise<{ accepted: number; readings: EngineTelemetryReading[] }> {
    const vehicle = await this.repository.findVehicle(organisationId, command.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${command.vehicleId} was not found`);
    }

    const now = new Date().toISOString();
    const readings = await this.repository.insertTelemetry(
      organisationId,
      command.vehicleId,
      command.deviceId ?? null,
      command.readings.map((reading) => ({
        metric: reading.metric,
        pid: reading.pid ?? null,
        value: reading.value,
        unit: reading.unit,
        sourceClassification: reading.sourceClassification ?? 'device',
        dataQuality: reading.dataQuality ?? 'good',
        recordedAt: reading.recordedAt ?? now,
        protocolMetadata: reading.protocolMetadata ?? {},
      })),
    );

    this.events.publish({
      type: 'engine.telemetry',
      vehicleId: command.vehicleId,
      readings,
      emittedAt: now,
    });

    await this.evaluateVehicleAlerts(organisationId, command.vehicleId);

    return { accepted: readings.length, readings };
  }

  /** Persist a DTC observation, running it through the lifecycle state machine. */
  async ingestDtc(
    organisationId: string,
    command: EngineIngestDtcCommand,
  ): Promise<{ dtc: EngineDtc; event: EngineDtcEvent }> {
    const vehicle = await this.repository.findVehicle(organisationId, command.vehicleId);
    if (!vehicle) {
      throw new NotFoundException(`Vehicle ${command.vehicleId} was not found`);
    }

    const code = command.code.toUpperCase();
    const existing = await this.repository.findDtcByCode(organisationId, command.vehicleId, code);
    const detectedAt = command.detectedAt ?? new Date().toISOString();
    const severity = command.severity ?? (existing?.severity ?? 'warning');
    const milOn = command.milOn ?? existing?.milOn ?? false;

    const transition = transitionDtc({
      current: existing,
      action: 'detect',
      severity,
      milOn,
    });

    const suppliedFreezeFrame = command.freezeFrame
      ? normalizeFreezeFrame(command.freezeFrame)
      : null;

    let dtc: EngineDtc | null;
    if (!existing) {
      dtc = await this.repository.insertDtc(organisationId, {
        vehicleId: command.vehicleId,
        code,
        category: command.category ?? code.charAt(0),
        description: command.description ?? defaultDtcDescription(code),
        severity,
        status: transition.status,
        milOn: transition.milOn,
        detectedAt,
        freezeFrame:
          suppliedFreezeFrame ?? (await this.captureFreezeFrame(organisationId, command.vehicleId)),
      });
    } else {
      dtc = await this.repository.updateDtc(organisationId, existing.id, {
        status: transition.status,
        severity,
        milOn: transition.milOn,
        lastDetectedAt: detectedAt,
        occurrenceCount: transition.occurrenceCount,
        acknowledged: transition.acknowledged,
        acknowledgedAt: transition.acknowledged ? existing.acknowledgedAt : null,
        acknowledgedBy: transition.acknowledged ? existing.acknowledgedBy : null,
        resolved: transition.resolved,
        resolvedAt: transition.resolved ? existing.resolvedAt : null,
        resolvedBy: transition.resolved ? existing.resolvedBy : null,
        freezeFrame:
          suppliedFreezeFrame ??
          (transition.captureFreezeFrame
            ? await this.captureFreezeFrame(organisationId, command.vehicleId)
            : existing.freezeFrame),
      });
    }

    if (!dtc) {
      throw new NotFoundException(`DTC ${code} could not be persisted`);
    }

    const event = await this.repository.insertDtcEvent(
      organisationId,
      dtc.vehicleId,
      dtc.id,
      dtc.code,
      transition.eventType,
      detectedAt,
      {
        occurrenceCount: transition.occurrenceCount,
        source: 'ingest',
        deviceId: command.deviceId ?? null,
      },
    );

    this.events.publish({
      type: 'engine.dtc',
      vehicleId: dtc.vehicleId,
      dtc,
      event,
      emittedAt: new Date().toISOString(),
    });

    await this.evaluateVehicleAlerts(organisationId, dtc.vehicleId);

    return { dtc, event };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /** Evaluate the built-in rules for a vehicle and persist the resulting alerts. */
  private async evaluateVehicleAlerts(organisationId: string, vehicleId: string): Promise<void> {
    const readings = await this.repository.latestTelemetry(organisationId, vehicleId);
    const dtcs = (await this.repository.listDtcs(organisationId, vehicleId, {})).filter((dtc) =>
      isLiveDtc(dtc),
    );
    const activeMilCodes = dtcs.filter((dtc) => dtc.milOn).map((dtc) => dtc.code);
    const policies = await this.repository.loadRecoveryPolicies(organisationId);
    const existingAlerts = await this.repository.listAlerts(organisationId, { vehicleId });

    const recoveryCounts = new Map<string, number>();
    for (const alert of existingAlerts) {
      recoveryCounts.set(alert.ruleId, alert.recoveryCount);
    }

    const evaluations = evaluateEngineRules({
      readings,
      activeMilCodes,
      recoveryCounts,
      recoveryPolicies: policies,
    });

    for (const evaluation of evaluations) {
      const shouldRaise = evaluation.breached;
      const existing = existingAlerts.find((alert) => alert.ruleId === evaluation.ruleId);
      const alreadyOpen = existing !== undefined && !existing.resolved;

      // Nothing to raise and nothing open — nothing to do.
      if (!shouldRaise && !alreadyOpen) continue;

      const isFreshOccurrence = shouldRaise && (!existing || existing.resolved);

      // The rule is healthy again but the recovery window has not elapsed: advance the
      // counter but keep the alert open.
      if (!shouldRaise && alreadyOpen && !evaluation.recovered) {
        await this.repository.upsertAlert(organisationId, {
          vehicleId,
          ruleId: evaluation.ruleId,
          severity: evaluation.severity,
          title: evaluation.title,
          description: evaluation.description,
          observedValue: evaluation.observedValue,
          observedUnit: evaluation.observedUnit,
          thresholdValue: evaluation.thresholdValue,
          sourceClassification: 'device',
          relatedDtc: null,
          relatedMetric: evaluation.metric,
          recoveryCount: evaluation.recoveryCount,
          recoveryThreshold: evaluation.recoveryThreshold,
          recovered: false,
          incrementOccurrence: false,
        });
        continue;
      }

      const alert = await this.repository.upsertAlert(organisationId, {
        vehicleId,
        ruleId: evaluation.ruleId,
        severity: evaluation.severity,
        title: evaluation.title,
        description: evaluation.description,
        observedValue: evaluation.observedValue,
        observedUnit: evaluation.observedUnit,
        thresholdValue: evaluation.thresholdValue,
        sourceClassification: 'device',
        relatedDtc: null,
        relatedMetric: evaluation.metric,
        recoveryCount: evaluation.recoveryCount,
        recoveryThreshold: evaluation.recoveryThreshold,
        recovered: shouldRaise ? false : evaluation.recovered,
        incrementOccurrence: isFreshOccurrence,
      });

      this.events.publish({
        type: 'engine.alert',
        vehicleId,
        alert,
        emittedAt: new Date().toISOString(),
      });
    }
  }

  /** Capture the values that were true at the moment a fault was raised. */
  private async captureFreezeFrame(
    organisationId: string,
    vehicleId: string,
  ): Promise<EngineFreezeFrame> {
    const readings = await this.repository.latestTelemetry(organisationId, vehicleId);
    const metrics: Record<string, number> = {};
    for (const reading of readings) {
      metrics[reading.metric] = reading.value;
    }

    const state = await this.repository.vehicleState(organisationId, vehicleId);

    return {
      capturedAt: new Date().toISOString(),
      source: 'dtc_trigger',
      metrics,
      vehicleState: state
        ? {
            speedKph: state.speedKph,
            rpm: metrics.engine_rpm ?? null,
            loadPct: metrics.engine_load_pct ?? null,
            coolantTempC: metrics.coolant_temp_c ?? null,
            fuelLevelPct: metrics.fuel_level_pct ?? null,
            ignition: state.ignition,
            odometerKm: state.odometerKm,
            latitude: state.latitude,
            longitude: state.longitude,
            heading: state.heading,
          }
        : null,
    };
  }

  /** Compute the health snapshot for a vehicle, fetching its telemetry. */
  private async computeHealth(
    organisationId: string,
    vehicleId: string,
    liveDtcs: EngineDtc[],
    openAlerts: EngineHealthAlert[],
  ): Promise<EngineHealthSnapshot & { lastReadingAt: string | null }> {
    const readings = await this.repository.latestTelemetry(organisationId, vehicleId);
    return this.computeHealthSnapshot(vehicleId, liveDtcs, openAlerts, readings);
  }

  /** Assemble a health snapshot from already-loaded data. */
  private computeHealthSnapshot(
    vehicleId: string,
    liveDtcs: EngineDtc[],
    openAlerts: EngineHealthAlert[],
    readings: EngineTelemetryReading[],
  ): EngineHealthSnapshot & { lastReadingAt: string | null } {
    const score = computeEngineHealthScore({
      activeDtcs: liveDtcs.map((dtc) => ({ severity: dtc.severity, milOn: dtc.milOn })),
      openAlerts: openAlerts.map((alert) => ({ severity: alert.severity })),
      readings: readings.map((reading) => ({
        metric: reading.metric,
        value: reading.value,
        unit: reading.unit,
        recordedAt: reading.recordedAt,
      })),
    });

    const lastReadingAt = readings.length
      ? readings
          .map((reading) => reading.recordedAt)
          .sort()
          .reverse()[0] ?? null
      : null;

    return {
      vehicleId,
      healthStatus: score.status,
      healthScore: score.score,
      scoreBreakdown: score.breakdown,
      charts: [],
      activeDtcCount: liveDtcs.length,
      openAlertCount: openAlerts.length,
      milOn: liveDtcs.some((dtc) => dtc.milOn),
      generatedAt: new Date().toISOString(),
      lastReadingAt,
    };
  }
}

/** Fill the defaults for a loosely-typed freeze-frame payload from an ingest caller. */
function normalizeFreezeFrame(input: {
  capturedAt?: string | undefined;
  source?: 'dtc_trigger' | 'manual' | 'scheduled';
  metrics: Record<string, number>;
  vehicleState?: {
    speedKph?: number | null | undefined;
    rpm?: number | null | undefined;
    loadPct?: number | null | undefined;
    coolantTempC?: number | null | undefined;
    fuelLevelPct?: number | null | undefined;
    ignition?: boolean | null | undefined;
    odometerKm?: number | null | undefined;
    latitude?: number | null | undefined;
    longitude?: number | null | undefined;
    heading?: number | null | undefined;
  } | null;
}): EngineFreezeFrame {
  const vehicleState = input.vehicleState ?? null;
  return {
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    source: input.source ?? 'dtc_trigger',
    metrics: input.metrics,
    vehicleState: vehicleState
      ? {
          speedKph: vehicleState.speedKph ?? null,
          rpm: vehicleState.rpm ?? null,
          loadPct: vehicleState.loadPct ?? null,
          coolantTempC: vehicleState.coolantTempC ?? null,
          fuelLevelPct: vehicleState.fuelLevelPct ?? null,
          ignition: vehicleState.ignition ?? null,
          odometerKm: vehicleState.odometerKm ?? null,
          latitude: vehicleState.latitude ?? null,
          longitude: vehicleState.longitude ?? null,
          heading: vehicleState.heading ?? null,
        }
      : null,
  };
}

/** Find the built-in rule that watches a metric. */
function findRuleForMetric(metric: string): { threshold: number } | null {
  const rule = ENGINE_HEALTH_RULES.find((candidate) => candidate.metric === metric);
  return rule ? { threshold: rule.threshold } : null;
}

/** A short human-readable description for a well-known DTC. */
function defaultDtcDescription(code: string): string {
  const known: Record<string, string> = {
    P0100: 'Mass air flow circuit malfunction',
    P0128: 'Coolant thermostat below regulating temperature',
    P0131: 'Oxygen sensor circuit low voltage',
    P0171: 'System too lean (bank 1)',
    P0300: 'Random/multiple cylinder misfire detected',
    P0301: 'Cylinder 1 misfire detected',
    P0302: 'Cylinder 2 misfire detected',
    P0420: 'Catalyst system efficiency below threshold',
    P0442: 'EVAP system small leak detected',
    P0505: 'Idle control system malfunction',
    P0562: 'System voltage low',
  };
  return known[code] ?? `Diagnostic trouble code ${code}`;
}

export type { EngineMetricPoint };
