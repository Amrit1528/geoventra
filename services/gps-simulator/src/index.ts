/**
 * GEOVENTRA — GPS simulator (backend service).
 *
 * Emits normalized telemetry frames for a deterministic demo fleet and pushes them to the
 * Geoventra API telemetry ingestion endpoint. It is a thin HTTP service with two responsibilities:
 *
 *   1. Expose a control API (/status, /control, /reset) so the NestJS SimulatorService can drive
 *      the simulator through RBAC and an audit trail.
 *   2. Publish live telemetry frames for ~120 vehicles on a fixed interval, normalized through the
 *      same SimulatorAdapter the production gateways use.
 *
 * Telemetry contract (the single seam between sources and persistence):
 *   SimulatorFrame ──► SimulatorAdapter.normalize() ──► NormalizedGpsEvent[]
 *      └──► POST /api/v1/ingest  (x-ingest-key: <shared secret>)
 *
 * The simulator never writes to the database itself; every sample must travel through the API so
 * that ingestion, geofence evaluation, alerting, trips and the live-position table are all
 * exercised exactly as they would be by a physical device gateway.
 */

import http from 'node:http';
import crypto from 'node:crypto';
import { setTimeout as sleep } from 'timers/promises';
import axios, { isAxiosError } from 'axios';
import {
  DEMO_FLEET,
  SimulatorAdapter,
  type DemoVehicle,
  type NormalizedGpsEvent,
  type SimulatorFrame,
  type SimulatorStatus,
} from '@geoventra/contracts';
import { SimulatedVehicle } from './vehicle-simulator.js';
import { loadSimulatorConfig } from './config.js';

import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const config = loadSimulatorConfig();
const adapter = new SimulatorAdapter();

// ── Fleet -------------------------------------------------------------------
const fleet = DEMO_FLEET.slice(0, config.vehicleCount);
const simulatedVehicles = new Map<string, SimulatedVehicle>();
for (const vehicle of fleet) {
  simulatedVehicles.set(vehicle.deviceId, new SimulatedVehicle(vehicle, config.seed, config.intervalMs));
}

// All demo cities represented in the active fleet — surfaced in SimulatorStatus.
const cities = new Set<string>(fleet.map((vehicle) => vehicle.cityName));

function cityNames(): string[] {
  return [...cities];
}

// ── State -------------------------------------------------------------------
let running = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let startedAt: number | null = null;
let lastPublishAt = 0;
let publishedEvents = 0;
let failedBatches = 0;

function nowMs(): number {
  return Date.now();
}

// ── Batch ingestion to the API ----------------------------------------------
function pushBatch(events: NormalizedGpsEvent[]): void {
  if (events.length === 0) return;
  lastPublishAt = nowMs();
  publishedEvents += events.length;

  axios
    .post(`${config.apiUrl}/tracking/ingest`, { events }, {
      headers: {
        'content-type': 'application/json',
        'x-ingest-key': config.ingestKey,
      },
      timeout: config.requestTimeoutMs,
    })
    .then((response) => {
      const accepted = (response.data as { accepted: number }).accepted ?? 0;
      if (accepted !== events.length) {
        failedBatches += 1;
        console.error(
          `[simulator] backend accepted ${accepted}/${events.length} of ${events.length} events`,
        );
      }
    })
    .catch((error) => {
      failedBatches += 1;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const message =
        isAxiosError(error) && error.response?.data
          ? String(error.response.data)
          : error.message;
      console.error(`[simulator] ingestion failed (HTTP ${status ?? 'network'}): ${message}`);
    });
}

// ── Simulation loop ----------------------------------------------------------
function publishLoop(): void {
  if (!running) return;
  const now = nowMs();
  const batch: NormalizedGpsEvent[] = [];

  for (const vehicle of simulatedVehicles.values()) {
    const event = vehicle.step(now, config.intervalMs);
    if (event != null && batch.length < config.batchSize) {
      batch.push(event);
    }
  }

  if (batch.length > 0) {
    pushBatch(batch);
  }

  intervalId = setTimeout(publishLoop, config.intervalMs);
}

// ── Control API --------------------------------------------------------------
function json(response: http.ServerResponse<http.IncomingMessage>, statusCode: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-request-id': cryptoRandomId(),
  });
  response.end(payload);
}

function readJsonBody(request: http.IncomingMessage, limit = 1_000_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function cryptoRandomId(): string {
  return crypto.randomBytes(16).toString('hex');
}

function buildSimulatorStatus(): SimulatorStatus {
  return {
    running,
    vehicleCount: fleet.length,
    intervalMs: config.intervalMs,
    seed: config.seed,
    startedAt: startedAt != null ? new Date(startedAt).toISOString() : null,
    uptimeSeconds: startedAt != null ? Math.round((nowMs() - startedAt) / 1000) : 0,
    lastPublishAt: lastPublishAt > 0 ? new Date(lastPublishAt).toISOString() : null,
    publishedEvents,
    failedBatches,
    apiConnected: config.apiUrl !== '' && config.ingestKey !== '',
    cities: cityNames(),
  };
}

function reseedFleet(): void {
  simulatedVehicles.clear();
  const newFleet = DEMO_FLEET.slice(0, config.vehicleCount);
  for (const vehicle of newFleet) {
    simulatedVehicles.set(vehicle.deviceId, new SimulatedVehicle(vehicle, config.seed, config.intervalMs));
  }
  cities.clear();
  for (const vehicle of newFleet) cities.add(vehicle.cityName);
}

function handleStatus(request: http.IncomingMessage, response: http.ServerResponse): void {
  json(response, 200, buildSimulatorStatus());
}

function handleControl(request: http.IncomingMessage, response: http.ServerResponse): void {
  readJsonBody(request)
    .then((body) => {
      const input = body as {
        running?: boolean;
        intervalMs?: number;
        vehicleCount?: number;
        seed?: string;
      };

      if (input.running !== undefined) {
        if (input.running && !running) {
          startedAt = Date.now();
          running = true;
          publishLoop();
          console.log('[simulator] started');
        } else if (!input.running && running) {
          running = false;
          if (intervalId) {
            clearTimeout(intervalId);
            intervalId = null;
          }
          console.log('[simulator] stopped');
        }
      }
      if (input.intervalMs) config.intervalMs = Math.max(500, Math.min(60_000, input.intervalMs));
      if (input.vehicleCount) config.vehicleCount = Math.min(120, Math.max(1, input.vehicleCount));
      if (input.seed) config.seed = input.seed;

      if (input.vehicleCount !== undefined || input.seed !== undefined) {
        reseedFleet();
      }

      json(response, 200, buildSimulatorStatus());
    })
    .catch((error) => json(response, 400, { error: error.message }));
}

function handleReset(request: http.IncomingMessage, response: http.ServerResponse): void {
  readJsonBody(request)
    .then((body) => {
      const input = body as { seed?: string; vehicleCount?: number };
      if (input.seed !== undefined) config.seed = input.seed;
      if (input.vehicleCount !== undefined) config.vehicleCount = Math.min(120, Math.max(1, input.vehicleCount));
      running = false;
      if (intervalId) {
        clearTimeout(intervalId);
        intervalId = null;
      }
      startedAt = null;
      lastPublishAt = 0;
      publishedEvents = 0;
      failedBatches = 0;
      reseedFleet();
      json(response, 200, buildSimulatorStatus());
    })
    .catch((error) => json(response, 400, { error: error.message }));
}

function handleIngest(request: http.IncomingMessage, response: http.ServerResponse): void {
  readJsonBody(request)
    .then((body) => {
      const input = body as { events?: unknown[] };
      const frames = input?.events ?? [];
      const normalized = adapter.normalize(frames as SimulatorFrame[]);
      json(response, 200, { normalized: normalized.length, frameCount: frames.length });
    })
    .catch((error) => json(response, 400, { error: error.message }));
}

// ── Server -------------------------------------------------------------------
const server = http.createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
  switch (url.pathname) {
    case '/status':
      handleStatus(request, response);
      break;
    case '/control':
      if (request.method === 'POST') handleControl(request, response);
      break;
    case '/reset':
      if (request.method === 'POST') handleReset(request, response);
      break;
    case '/ingest':
      if (request.method === 'POST') handleIngest(request, response);
      break;
    default:
      json(response, 404, { error: 'Not found' });
  }
});

function start(port: number): void {
  server.listen(port, '0.0.0.0', () => {
    console.log(`[simulator] listening on http://0.0.0.0:${port}`);
    console.log(`[simulator] vehicles: ${fleet.length} | seed: ${config.seed}`);
  });
}

function stop(): void {
  running = false;
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
  }
  server.close(() => process.exit(0));
}

// Respect SIGTERM / process exit for graceful shutdown.
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

// Start the simulator. The frontend dev server is the only consumer that needs it running
// immediately; the API drives it through /control whenever needed.
start(config.port);
if (config.autostart && config.apiUrl !== '' && config.ingestKey !== '') {
  startedAt = Date.now();
  running = true;
  publishLoop();
  console.log('[simulator] autostart: publishing to API');
}
