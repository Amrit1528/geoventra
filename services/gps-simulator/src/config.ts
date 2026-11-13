/**
 * GEOVENTRA — simulator configuration.
 *
 * `loadSimulatorConfig` reads the environment and applies the documented defaults. The
 * simulator fails fast when the API connection is configured but unreachable — an ingestion
 * key is required whenever `SIMULATOR_AUTOSTART=true`.
 */

export interface SimulatorConfig {
  /** Number of demo vehicles to publish telemetry for (1–120). */
  vehicleCount: number;
  /** Deterministic seed for the fleet. */
  seed: string;
  /** Publish interval in milliseconds. */
  intervalMs: number;
  /** Base URL of the Geoventra API (without a trailing slash). */
  apiUrl: string;
  /** Shared secret sent as `x-ingest-key`. */
  ingestKey: string;
  /** Maximum events per HTTP batch. */
  batchSize: number;
  /** HTTP timeout for ingestion calls, in milliseconds. */
  requestTimeoutMs: number;
  /** Control-plane port. */
  port: number;
  /** Start publishing immediately on boot. */
  autostart: boolean;
}

const DEFAULTS = {
  vehicleCount: 120,
  intervalMs: 2_000,
  batchSize: 60,
  requestTimeoutMs: 10_000,
  port: 8085,
} as const;

/** Load the simulator configuration from the process environment. */
export function loadSimulatorConfig(): SimulatorConfig {
  const apiUrl = stripTrailingSlash(process.env.SIMULATOR_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '');
  const ingestKey = process.env.INGEST_SHARED_SECRET ?? process.env.SIMULATOR_INGEST_KEY ?? '';

  const config: SimulatorConfig = {
    vehicleCount: clamp(
      toInt(process.env.SIMULATOR_VEHICLE_COUNT, DEFAULTS.vehicleCount),
      1,
      120,
    ),
    seed: (process.env.SIMULATOR_SEED ?? 'geoventra-demo').trim() || 'geoventra-demo',
    intervalMs: clamp(
      toInt(process.env.SIMULATOR_INTERVAL_MS, DEFAULTS.intervalMs),
      500,
      60_000,
    ),
    apiUrl,
    ingestKey,
    batchSize: clamp(
      toInt(process.env.SIMULATOR_BATCH_SIZE, DEFAULTS.batchSize),
      1,
      500,
    ),
    requestTimeoutMs: clamp(
      toInt(process.env.SIMULATOR_REQUEST_TIMEOUT_MS, DEFAULTS.requestTimeoutMs),
      1_000,
      60_000,
    ),
    port: clamp(toInt(process.env.SIMULATOR_PORT ?? process.env.PORT, DEFAULTS.port), 1, 65_535),
    autostart: (process.env.SIMULATOR_AUTOSTART ?? 'true').trim().toLowerCase() !== 'false',
  };

  return config;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function toInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
