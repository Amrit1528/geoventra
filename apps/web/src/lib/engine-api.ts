/**
 * GEOVENTRA — engine diagnostics API client.
 *
 * Every Phase 5.1 engine endpoint has a typed function here, together with the
 * query-parameter builder that produces the exact URL the API expects.
 */

import type {
  EngineDtc,
  EngineDtcEvent,
  EngineFreezeFrame,
  EngineHealthAlert,
  EngineHealthChart,
  EngineHealthSnapshot,
  EngineDiagnosticsOverview,
  EngineTelemetryReading,
  EngineTimelineEntry,
  EngineVehicleSummary,
  Paginated,
} from '@geoventra/contracts';
import { apiRequest, type QueryParams } from './api';

// ── Query parameter builders ──────────────────────────────────────────────────

export interface EngineVehiclesQuery {
  /** Free-text search across registration and vehicle name. */
  q?: string;
  /** 1-based page number. */
  page?: number;
  /** Rows per page. */
  pageSize?: number;
}

/** Build the query string for `GET /engine/vehicles`. */
export function buildEngineVehiclesQuery(query: EngineVehiclesQuery = {}): QueryParams {
  return {
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export interface EngineTelemetryQuery {
  /** Inclusive lower bound (ISO-8601). */
  from?: string;
  /** Exclusive upper bound (ISO-8601). */
  to?: string;
  /** Single metric filter. */
  metric?: string;
  /** Comma-separated metric filter. */
  metrics?: string;
  /** Aggregation bucket. */
  bucket?: EngineBucket;
  /** Maximum number of rows. */
  limit?: number;
}

export type EngineBucket = 'raw' | 'minute' | 'hour' | 'day';

/** Build the query string for `GET /engine/vehicles/:id/telemetry`. */
export function buildEngineTelemetryQuery(query: EngineTelemetryQuery = {}): QueryParams {
  return {
    from: query.from,
    to: query.to,
    metric: query.metric,
    metrics: query.metrics,
    bucket: query.bucket,
    limit: query.limit,
  };
}

export interface EngineChartsQuery {
  from?: string;
  to?: string;
  metrics?: string;
  bucket?: EngineBucket;
}

/** Build the query string for `GET /engine/vehicles/:id/charts`. */
export function buildEngineChartsQuery(query: EngineChartsQuery = {}): QueryParams {
  return {
    from: query.from,
    to: query.to,
    metrics: query.metrics,
    bucket: query.bucket,
  };
}

export interface EngineDtcQuery {
  status?: string;
  severity?: string;
  code?: string;
  page?: number;
  pageSize?: number;
}

/** Build the query string for `GET /engine/vehicles/:id/dtcs`. */
export function buildEngineDtcQuery(query: EngineDtcQuery = {}): QueryParams {
  return {
    status: query.status,
    severity: query.severity,
    code: query.code,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export interface EngineTimelineQuery {
  from?: string;
  to?: string;
  kind?: 'dtc' | 'alert' | 'telemetry' | 'device';
  limit?: number;
}

/** Build the query string for `GET /engine/vehicles/:id/timeline`. */
export function buildEngineTimelineQuery(query: EngineTimelineQuery = {}): QueryParams {
  return {
    from: query.from,
    to: query.to,
    kind: query.kind,
    limit: query.limit,
  };
}

export interface EngineAlertsQuery {
  vehicleId?: string;
  severity?: string;
  status?: string;
}

/** Build the query string for `GET /engine/alerts`. */
export function buildEngineAlertsQuery(query: EngineAlertsQuery = {}): QueryParams {
  return {
    vehicleId: query.vehicleId,
    severity: query.severity,
    status: query.status,
  };
}

// ── Endpoint functions ────────────────────────────────────────────────────────

/** List the engine-enabled vehicles of the organisation. */
export function fetchEngineVehicles(
  query: EngineVehiclesQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<EngineVehicleSummary>> {
  return apiRequest<Paginated<EngineVehicleSummary>>('/engine/vehicles', {
    query: buildEngineVehiclesQuery(query),
    signal,
  });
}

/** Full diagnostics overview of a single vehicle. */
export function fetchEngineOverview(
  vehicleId: string,
  signal?: AbortSignal,
): Promise<EngineDiagnosticsOverview> {
  return apiRequest<EngineDiagnosticsOverview>(
    `/engine/vehicles/${encodeURIComponent(vehicleId)}/overview`,
    { signal },
  );
}

/** Historical telemetry readings of a vehicle. */
export function fetchEngineTelemetry(
  vehicleId: string,
  query: EngineTelemetryQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<EngineTelemetryReading>> {
  return apiRequest<Paginated<EngineTelemetryReading>>(
    `/engine/vehicles/${encodeURIComponent(vehicleId)}/telemetry`,
    { query: buildEngineTelemetryQuery(query), signal },
  );
}

/** Latest reading per metric of a vehicle. */
export function fetchLatestTelemetry(
  vehicleId: string,
  signal?: AbortSignal,
): Promise<{ data: EngineTelemetryReading[] }> {
  return apiRequest<{ data: EngineTelemetryReading[] }>(
    `/engine/vehicles/${encodeURIComponent(vehicleId)}/telemetry/latest`,
    { signal },
  );
}

/** Aggregated health chart series of a vehicle. */
export function fetchEngineCharts(
  vehicleId: string,
  query: EngineChartsQuery = {},
  signal?: AbortSignal,
): Promise<{ data: EngineHealthChart[] }> {
  return apiRequest<{ data: EngineHealthChart[] }>(
    `/engine/vehicles/${encodeURIComponent(vehicleId)}/charts`,
    { query: buildEngineChartsQuery(query), signal },
  );
}

/** Current health snapshot (score, breakdown, counters) of a vehicle. */
export function fetchEngineHealth(
  vehicleId: string,
  signal?: AbortSignal,
): Promise<EngineHealthSnapshot> {
  return apiRequest<EngineHealthSnapshot>(
    `/engine/vehicles/${encodeURIComponent(vehicleId)}/health`,
    { signal },
  );
}

/** Diagnostic trouble codes recorded for a vehicle. */
export function fetchVehicleDtcs(
  vehicleId: string,
  query: EngineDtcQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<EngineDtc>> {
  return apiRequest<Paginated<EngineDtc>>(
    `/engine/vehicles/${encodeURIComponent(vehicleId)}/dtcs`,
    { query: buildEngineDtcQuery(query), signal },
  );
}

/** A single DTC including its event history. */
export function fetchDtc(dtcId: string, signal?: AbortSignal): Promise<EngineDtc & { events?: EngineDtcEvent[] }> {
  return apiRequest<EngineDtc & { events?: EngineDtcEvent[] }>(
    `/engine/dtcs/${encodeURIComponent(dtcId)}`,
    { signal },
  );
}

/** Acknowledge a DTC. */
export function acknowledgeDtc(dtcId: string): Promise<EngineDtc> {
  return apiRequest<EngineDtc>(`/engine/dtcs/${encodeURIComponent(dtcId)}/acknowledge`, {
    method: 'POST',
    body: {},
  });
}

/** Resolve a DTC. */
export function resolveDtc(dtcId: string): Promise<EngineDtc> {
  return apiRequest<EngineDtc>(`/engine/dtcs/${encodeURIComponent(dtcId)}/resolve`, {
    method: 'POST',
    body: {},
  });
}

/** Freeze frame captured when a DTC was raised. */
export function fetchFreezeFrame(dtcId: string, signal?: AbortSignal): Promise<EngineFreezeFrame> {
  return apiRequest<EngineFreezeFrame>(
    `/engine/dtcs/${encodeURIComponent(dtcId)}/freeze-frame`,
    { signal },
  );
}

/** Merged diagnostic event timeline of a vehicle. */
export function fetchEngineTimeline(
  vehicleId: string,
  query: EngineTimelineQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<EngineTimelineEntry>> {
  return apiRequest<Paginated<EngineTimelineEntry>>(
    `/engine/vehicles/${encodeURIComponent(vehicleId)}/timeline`,
    { query: buildEngineTimelineQuery(query), signal },
  );
}

/** Engine health alerts, optionally scoped to a vehicle. */
export function fetchEngineAlerts(
  query: EngineAlertsQuery = {},
  signal?: AbortSignal,
): Promise<Paginated<EngineHealthAlert>> {
  return apiRequest<Paginated<EngineHealthAlert>>('/engine/alerts', {
    query: buildEngineAlertsQuery(query),
    signal,
  });
}

/** Acknowledge an engine health alert. */
export function acknowledgeEngineAlert(alertId: string): Promise<EngineHealthAlert> {
  return apiRequest<EngineHealthAlert>(`/engine/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
    method: 'POST',
    body: {},
  });
}

/** Resolve an engine health alert. */
export function resolveEngineAlert(alertId: string): Promise<EngineHealthAlert> {
  return apiRequest<EngineHealthAlert>(`/engine/alerts/${encodeURIComponent(alertId)}/resolve`, {
    method: 'POST',
    body: {},
  });
}
