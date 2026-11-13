/**
 * Integration tests for the engine diagnostics API.
 *
 * These run against an isolated test database (`geoventra_test` by default) that is
 * migrated and seeded before the suite starts. The seeded fleet contains:
 *
 *   vehicleIds[0] — P0300 (active, MIL on, freeze frame) + unhealthy telemetry + 2 alerts
 *   vehicleIds[1] — P0128 (cleared) + healthy telemetry
 *   vehicleIds[2] — untouched, used for the "empty" cases
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test, type TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import pg from 'pg';
import request from 'supertest';
import { AppModule } from '../app.module.js';

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(__dirname, '../../../..');
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://geoventra@localhost:5432/geoventra_test';
const TSX_BIN = resolve(REPO_ROOT, 'apps/api/node_modules/.bin/tsx');
const INGEST_KEY = 'integration-ingest-key';
const ADMIN_EMAIL = 'admin@geoventra.in';
const ADMIN_PASSWORD = 'Geoventra@2026';

/** Deterministic identifiers from database/seeds/seed.ts. */
const VEHICLE_IDS = [
  'e1000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000003',
] as const;

describe('Engine diagnostics API (integration)', () => {
  let app: INestApplication;
  let accessToken: string;
  let vehicleId: string;
  let dtcId: string;

  beforeAll(async () => {
    // ── Environment ──────────────────────────────────────────────────────────
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.TEST_DATABASE_URL = TEST_DATABASE_URL;
    process.env.DATABASE_SCHEMA = 'geoventra';
    process.env.INGEST_SHARED_SECRET = INGEST_KEY;
    process.env.JWT_ACCESS_SECRET = 'integration-access-secret';
    process.env.PORT = '0';

    // ── Reset the engine domain so the suite is deterministic on re-runs ─────
    const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
    await client.connect();
    try {
      await client.query(`DELETE FROM geoventra.engine_dtc_events`);
      await client.query(`DELETE FROM geoventra.engine_health_alerts`);
      await client.query(`DELETE FROM geoventra.engine_dtcs`);
      await client.query(`DELETE FROM geoventra.engine_telemetry_readings`);
      await client.query(`DELETE FROM geoventra.engine_devices`);
    } finally {
      await client.end();
    }

    // ── Bring the test database up to date ───────────────────────────────────
    await execFileAsync(TSX_BIN, ['database/migrate.ts', '--database', TEST_DATABASE_URL], {
      cwd: REPO_ROOT,
    });
    await execFileAsync(TSX_BIN, ['database/seeds/seed.ts', '--database', TEST_DATABASE_URL], {
      cwd: REPO_ROOT,
    });

    // ── Boot the application ─────────────────────────────────────────────────
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', {
      exclude: ['health', 'health/live', 'health/ready'],
    });
    await app.init();

    vehicleId = VEHICLE_IDS[0];

    // ── Sign in ───────────────────────────────────────────────────────────────
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      .expect(200);

    accessToken = response.body.accessToken;
    expect(accessToken).toBeTruthy();
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  // ── Auth ──────────────────────────────────────────────────────────────────

  it('rejects an unknown password', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: ADMIN_EMAIL, password: 'not-the-password' })
      .expect(401);
  });

  it('returns the authenticated principal', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.email).toBe(ADMIN_EMAIL);
    expect(response.body.permissions).toContain('engine.read');
    expect(response.body.permissions).toContain('engine.write');
  });

  it('rejects requests without a bearer token', async () => {
    await request(app.getHttpServer()).get('/api/v1/engine/vehicles').expect(401);
  });

  // ── Fleet listing ─────────────────────────────────────────────────────────

  it('lists vehicles with engine diagnostics counters', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/engine/vehicles')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body.data)).toBe(true);
    const seeded = response.body.data.find((entry: { vehicleId: string }) => entry.vehicleId === vehicleId);
    expect(seeded).toBeDefined();
    expect(seeded.milOn).toBe(true);
    expect(seeded.activeDtcCount).toBe(1);
    expect(seeded.healthStatus).toBe('critical');
    expect(seeded.deviceId).toBeTruthy();
  });

  it('reports a healthy fleet for untouched vehicles', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/engine/vehicles')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const fresh = response.body.data.find(
      (entry: { vehicleId: string }) => entry.vehicleId === VEHICLE_IDS[2],
    );
    expect(fresh).toBeDefined();
    expect(fresh.healthStatus).toBe('healthy');
    expect(fresh.openAlertCount).toBe(0);
  });

  // ── Overview ──────────────────────────────────────────────────────────────

  it('returns the diagnostics overview', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/overview`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.vehicle.vehicleId).toBe(vehicleId);
    expect(response.body.vehicle.milOn).toBe(true);
    expect(response.body.health.healthScore).toBeLessThanOrEqual(50);
    expect(response.body.health.scoreBreakdown).toHaveLength(4);
    expect(response.body.dtcCounts.active).toBe(1);
    expect(response.body.latestTelemetry.length).toBeGreaterThan(0);
    expect(response.body.openAlerts.length).toBe(2);
  });

  // ── Telemetry ─────────────────────────────────────────────────────────────

  it('returns latest telemetry per metric', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/telemetry/latest`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const metrics = response.body.data.map((reading: { metric: string }) => reading.metric);
    expect(metrics).toContain('engine_rpm');
    expect(metrics).toContain('coolant_temp_c');
    expect(metrics).toContain('battery_voltage_v');
  });

  it('ingests telemetry with a valid ingest key', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/engine/ingest')
      .set('x-ingest-key', INGEST_KEY)
      .send({
        vehicleId,
        deviceId: 'GEO-OBD-0001',
        readings: [
          { metric: 'coolant_temp_c', value: 141, unit: '°C' },
          { metric: 'engine_rpm', value: 7100, unit: 'rpm' },
        ],
      })
      .expect(202);

    expect(response.body.accepted).toBe(2);

    const latest = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/telemetry/latest`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const coolant = latest.body.data.find(
      (reading: { metric: string }) => reading.metric === 'coolant_temp_c',
    );
    expect(coolant.value).toBe(141);
  });

  it('rejects telemetry ingestion without a valid ingest key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/engine/ingest')
      .set('x-ingest-key', 'wrong-key')
      .send({
        vehicleId,
        readings: [{ metric: 'engine_rpm', value: 1000, unit: 'rpm' }],
      })
      .expect(401);
  });

  it('returns historical telemetry filtered by metric', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/telemetry?metric=coolant_temp_c`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    for (const reading of response.body.data) {
      expect(reading.metric).toBe('coolant_temp_c');
    }
  });

  // ── Charts ────────────────────────────────────────────────────────────────

  it('returns engine health charts with a threshold for overheating rules', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/charts`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    const coolant = response.body.data.find(
      (chart: { metric: string }) => chart.metric === 'coolant_temp_c',
    );
    expect(coolant).toBeDefined();
    expect(coolant.threshold).toBe(105);
    expect(coolant.points.length).toBeGreaterThan(0);
    expect(coolant.latest).not.toBeNull();
  });

  it('returns the engine health snapshot with breakdown', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/health`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.vehicleId).toBe(vehicleId);
    expect(['healthy', 'degraded', 'critical']).toContain(response.body.healthStatus);
    expect(response.body.scoreBreakdown.map((part: { key: string }) => part.key)).toEqual(
      expect.arrayContaining(['dtcs', 'alerts', 'metrics', 'mil']),
    );
    expect(response.body.charts.length).toBeGreaterThan(0);
  });

  // ── DTC lifecycle ─────────────────────────────────────────────────────────

  it('lists the seeded active DTC', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/dtcs`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const misfire = response.body.data.find(
      (dtc: { code: string }) => dtc.code === 'P0300',
    );
    expect(misfire).toBeDefined();
    expect(misfire.status).toBe('active');
    expect(misfire.milOn).toBe(true);
    expect(misfire.occurrenceCount).toBe(3);
    dtcId = misfire.id;
  });

  it('returns the freeze frame captured for the DTC', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/dtcs/${dtcId}/freeze-frame`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body).not.toBeNull();
    expect(response.body.metrics).toHaveProperty('engine_rpm');
    expect(response.body.source).toBe('dtc_trigger');
  });

  it('ingests a new DTC and records a detected event', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/engine/dtcs/ingest')
      .set('x-ingest-key', INGEST_KEY)
      .send({
        vehicleId,
        code: 'P0301',
        severity: 'critical',
        milOn: true,
        detectedAt: new Date().toISOString(),
        freezeFrame: {
          metrics: { engine_rpm: 7100, coolant_temp_c: 141 },
          vehicleState: { speedKph: 0, rpm: 7100, coolantTempC: 141 },
        },
      })
      .expect(202);

    expect(response.body.dtc.code).toBe('P0301');
    expect(response.body.dtc.status).toBe('active');
    expect(response.body.event.eventType).toBe('detected');
  });

  it('increments the occurrence count when a known DTC is re-detected', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/engine/dtcs/ingest')
      .set('x-ingest-key', INGEST_KEY)
      .send({
        vehicleId,
        code: 'P0300',
        severity: 'critical',
        milOn: true,
        detectedAt: new Date().toISOString(),
      })
      .expect(202);

    expect(response.body.dtc.occurrenceCount).toBe(4);
    expect(response.body.event.eventType).toBe('updated');
  });

  it('acknowledges and resolves a DTC', async () => {
    const acknowledged = await request(app.getHttpServer())
      .post(`/api/v1/engine/dtcs/${dtcId}/acknowledge`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(acknowledged.body.status).toBe('acknowledged');
    expect(acknowledged.body.acknowledgedBy).toBeTruthy();

    const resolved = await request(app.getHttpServer())
      .post(`/api/v1/engine/dtcs/${dtcId}/resolve`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(resolved.body.status).toBe('cleared');
    expect(resolved.body.resolved).toBe(true);
    expect(resolved.body.resolvedAt).toBeTruthy();

    const details = await request(app.getHttpServer())
      .get(`/api/v1/engine/dtcs/${dtcId}`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(details.body.events.map((event: { eventType: string }) => event.eventType)).toEqual(
      expect.arrayContaining(['detected', 'acknowledged', 'resolved']),
    );
  });

  it('refuses to acknowledge a DTC that does not exist', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/engine/dtcs/00000000-0000-4000-8000-000000000001/acknowledge')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  // ── Timeline ──────────────────────────────────────────────────────────────

  it('returns a mixed diagnostic timeline', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/engine/vehicles/${vehicleId}/timeline?limit=50`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.data.length).toBeGreaterThan(0);
    const kinds = new Set(response.body.data.map((entry: { kind: string }) => entry.kind));
    expect(kinds).toContain('dtc');
  });

  // ── Telemetry ingestion (GPS path) ─────────────────────────────────────────

  it('ingests a GPS frame and reflects it in the snapshot', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/tracking/ingest')
      .set('x-ingest-key', INGEST_KEY)
      .send({
        events: [
          {
            deviceId: 'GEO-GPS-0001',
            vehicleId,
            latitude: 18.5204,
            longitude: 73.8567,
            speedKph: 42,
            heading: 90,
            ignition: true,
            batteryVoltage: 13.1,
            gpsSignal: 'ok',
            accuracyM: 6,
            satelliteCount: 15,
            odometerKm: 42_500,
            engineHours: 1_300,
            recordedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(202);

    expect(response.body.accepted).toBe(1);

    const snapshot = await request(app.getHttpServer())
      .get('/api/v1/tracking/snapshot')
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    const entry = snapshot.body.positions.find(
      (position: { vehicleId: string }) => position.vehicleId === vehicleId,
    );
    expect(entry).toBeDefined();
    expect(entry.latitude).toBeCloseTo(18.5204, 4);
    expect(entry.deviceId).toBe('GEO-GPS-0001');
    expect(entry.deviceStatus).toBe('online');
    expect(entry.status).toBe('moving');
  });

  it('rejects GPS ingestion without a valid ingest key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/tracking/ingest')
      .set('x-ingest-key', 'nope')
      .send({ events: [] })
      .expect(401);
  });

  // ── Alerts ────────────────────────────────────────────────────────────────

  it('lists the seeded open alerts and acknowledges one', async () => {
    const list = await request(app.getHttpServer())
      .get(`/api/v1/engine/alerts?vehicleId=${vehicleId}&resolved=false`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    // The seed provisions engine_overheating and high_rpm; the ingestion path legitimately
    // raises low_voltage and mil_active on top of them. Assert the seeded rules are present.
    const ruleIds = list.body.data.map((alert: { ruleId: string }) => alert.ruleId);
    expect(ruleIds).toEqual(expect.arrayContaining(['engine_overheating', 'high_rpm']));
    const alertId = list.body.data.find(
      (alert: { ruleId: string }) => alert.ruleId === 'engine_overheating',
    ).id;

    const acknowledged = await request(app.getHttpServer())
      .post(`/api/v1/engine/alerts/${alertId}/acknowledge`)
      .set('authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(acknowledged.body.acknowledged).toBe(true);
  });
});
