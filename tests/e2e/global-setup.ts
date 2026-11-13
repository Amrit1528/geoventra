/**
 * GEOVENTRA — Playwright global setup fixture.
 *
 * Prepares the isolated `geoventra_test` database deterministically for the E2E suite:
 *
 *   1. Runs the migration runner and the idempotent seed.
 *   2. Seeds live positions for the three seeded fleet vehicles:
 *        MH 12 AB 1234 (moving, fresh), MH 12 CD 5678 (idle, fresh), MH 12 EF 9012 (stale — offline).
 *   3. Seeds a completed trip (with GPS points) for the first vehicle.
 *   4. Seeds a second organisation (Northstar Logistics, admin@northstar.in) with no fleet.
 *
 * Every step is idempotent: fixed UUIDs, ON CONFLICT guards.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import pg from 'pg';
import { hashPassword } from '../../database/hash.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://geoventra@localhost:5432/geoventra_test';
const TSX_BIN = resolve(REPO_ROOT, 'services/gps-simulator/node_modules/.bin/tsx');

const ORG_GEOVENTRA = 'a1000000-0000-4000-8000-000000000001';
const ORG_NORTHSTAR = 'a2000000-0000-4000-8000-0000000000aa';

// Seeded identifiers (see database/seeds/seed.ts).
const VEHICLE_1 = 'e1000000-0000-4000-8000-000000000001';
const VEHICLE_2 = 'e1000000-0000-4000-8000-000000000002';
const VEHICLE_3 = 'e1000000-0000-4000-8000-000000000003';
const DEVICE_GPS = 'f1000000-0000-4000-8000-000000000001';

const TRIP_ID = '55000000-0000-4000-8000-000000000001';

export default async function globalSetup(): Promise<void> {
  execFileSync(TSX_BIN, ['database/migrate.ts', '--database', TEST_DATABASE_URL], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  execFileSync(TSX_BIN, ['database/seeds/seed.ts', '--database', TEST_DATABASE_URL], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    // ── Live positions ───────────────────────────────────────────────────────
    // Vehicle 1 — fresh, moving, Pune corridor.
    await client.query(
      `INSERT INTO geoventra.gps_positions
         (id, organisation_id, vehicle_id, device_id, position, latitude, longitude, speed_kph,
          heading, ignition, accuracy_m, gps_signal, satellites, battery_voltage, odometer_km,
          engine_hours, source, event_id, recorded_at)
       VALUES ($1, $2, $3, $4,
               ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $5, $6, 46.5, 78, TRUE,
               6.4, 'ok', 15, 13.1, 84_512.10, 3120.30, 'http', 'e2e:v1', now() - interval '30 seconds')
       ON CONFLICT DO NOTHING`,
      ['11100000-0000-4000-8000-0000000000e1', ORG_GEOVENTRA, VEHICLE_1, DEVICE_GPS, 18.5204, 73.8567],
    );
    await client.query(
      `INSERT INTO geoventra.vehicle_live_status
         (vehicle_id, organisation_id, latitude, longitude, position, speed_kph, heading,
          ignition, battery_voltage, gps_signal, accuracy_m, odometer_km, engine_hours,
          status, last_recorded_at, last_received_at, updated_at)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, 46.5, 78,
               TRUE, 13.1, 'ok', 6.4, 84_512.10, 3120.30, 'moving', now() - interval '30 seconds', now(), now())
       ON CONFLICT (vehicle_id) DO UPDATE SET
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, position = EXCLUDED.position,
         speed_kph = EXCLUDED.speed_kph, heading = EXCLUDED.heading, ignition = EXCLUDED.ignition,
         battery_voltage = EXCLUDED.battery_voltage, gps_signal = EXCLUDED.gps_signal,
         odometer_km = EXCLUDED.odometer_km, engine_hours = EXCLUDED.engine_hours,
         status = EXCLUDED.status, last_recorded_at = EXCLUDED.last_recorded_at, updated_at = now()`,
      [VEHICLE_1, ORG_GEOVENTRA, 18.5204, 73.8567],
    );

    // Vehicle 2 — fresh, idle.
    await client.query(
      `INSERT INTO geoventra.gps_positions
         (id, organisation_id, vehicle_id, device_id, position, latitude, longitude, speed_kph,
          heading, ignition, accuracy_m, gps_signal, satellites, battery_voltage, odometer_km,
          engine_hours, source, event_id, recorded_at)
       VALUES ($1, $2, $3, $4,
               ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $5, $6, 0, 90, TRUE,
               8.1, 'ok', 14, 12.6, 52_121.4, 1980.40, 'http', 'e2e:v2', now() - interval '20 seconds')
       ON CONFLICT DO NOTHING`,
      ['11100000-0000-4000-8000-0000000000e2', ORG_GEOVENTRA, VEHICLE_2, DEVICE_GPS, 18.5312, 73.8445],
    );
    await client.query(
      `INSERT INTO geoventra.vehicle_live_status
         (vehicle_id, organisation_id, latitude, longitude, position, speed_kph, heading,
          ignition, battery_voltage, gps_signal, accuracy_m, odometer_km, engine_hours,
          status, last_recorded_at, last_received_at, updated_at)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, 0, 90,
               TRUE, 12.6, 'ok', 8.1, 52_121.4, 1980.40, 'idle', now() - interval '20 seconds', now(), now())
       ON CONFLICT (vehicle_id) DO UPDATE SET
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, position = EXCLUDED.position,
         speed_kph = EXCLUDED.speed_kph, heading = EXCLUDED.heading, ignition = EXCLUDED.ignition,
         battery_voltage = EXCLUDED.battery_voltage, gps_signal = EXCLUDED.gps_signal,
         odometer_km = EXCLUDED.odometer_km, engine_hours = EXCLUDED.engine_hours,
         status = EXCLUDED.status, last_recorded_at = EXCLUDED.last_recorded_at, updated_at = now()`,
      [VEHICLE_2, ORG_GEOVENTRA, 18.5312, 73.8445],
    );

    // Vehicle 3 — stale (2h ago) → renders as offline in the UI.
    await client.query(
      `INSERT INTO geoventra.gps_positions
         (id, organisation_id, vehicle_id, device_id, position, latitude, longitude, speed_kph,
          heading, ignition, accuracy_m, gps_signal, satellites, battery_voltage, odometer_km,
          engine_hours, source, event_id, recorded_at)
       VALUES ($1, $2, $3, $4,
               ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $5, $6, 0, 270, FALSE,
               21.5, 'weak', 6, 11.9, 12_301.2, 410.60, 'http', 'e2e:v3', now() - interval '2 hours')
       ON CONFLICT DO NOTHING`,
      ['11100000-0000-4000-8000-0000000000e3', ORG_GEOVENTRA, VEHICLE_3, DEVICE_GPS, 18.5158, 73.9012],
    );
    await client.query(
      `INSERT INTO geoventra.vehicle_live_status
         (vehicle_id, organisation_id, latitude, longitude, position, speed_kph, heading,
          ignition, battery_voltage, gps_signal, accuracy_m, odometer_km, engine_hours,
          status, last_recorded_at, last_received_at, updated_at)
       VALUES ($1, $2, $3, $4, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, 0, 270,
               FALSE, 11.9, 'weak', 21.5, 12_301.2, 410.60, 'offline', now() - interval '2 hours', now() - interval '2 hours', now() - interval '2 hours')
       ON CONFLICT (vehicle_id) DO UPDATE SET
         latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, position = EXCLUDED.position,
         speed_kph = EXCLUDED.speed_kph, heading = EXCLUDED.heading, ignition = EXCLUDED.ignition,
         battery_voltage = EXCLUDED.battery_voltage, gps_signal = EXCLUDED.gps_signal,
         odometer_km = EXCLUDED.odometer_km, engine_hours = EXCLUDED.engine_hours,
         status = EXCLUDED.status, last_recorded_at = EXCLUDED.last_recorded_at, updated_at = now()`,
      [VEHICLE_3, ORG_GEOVENTRA, 18.5158, 73.9012],
    );

    // ── Completed trip with GPS points (45 min ago → 15 min ago) ─────────────
    // Deterministic 8-point route across Pune (~4.1 km).
    const route: Array<[number, number]> = [
      [18.5204, 73.8567],
      [18.5251, 73.8691],
      [18.5298, 73.8815],
      [18.5335, 73.8940],
      [18.5381, 73.9068],
      [18.5427, 73.9191],
      [18.5472, 73.9312],
      [18.5518, 73.9428],
    ];
    const startTime = new Date(Date.now() - 45 * 60_000);
    const endTime = new Date(Date.now() - 15 * 60_000);
    const startOdo = 84_400.2;
    let distanceKm = 0;
    for (let i = 1; i < route.length; i += 1) {
      distanceKm += haversineMeters(route[i - 1]![0], route[i - 1]![1], route[i]![0], route[i]![1]) / 1000;
    }
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);
    const avgSpeed = distanceKm / (durationSeconds / 3600);

    await client.query(
      `INSERT INTO geoventra.trips
         (id, organisation_id, vehicle_id, driver_id, status, started_at, ended_at,
          distance_km, duration_seconds, avg_speed_kph, max_speed_kph, idle_seconds,
          start_position, start_latitude, start_longitude,
          end_position, end_latitude, end_longitude,
          start_label, end_label, destination_label, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'completed', $5, $6,
               $7, $8, $9, 62.4, 120,
               ST_SetSRID(ST_MakePoint($11, $10), 4326)::geography, $10, $11,
               ST_SetSRID(ST_MakePoint($13, $12), 4326)::geography, $12, $13,
               'Pune Depot', 'Hinjawadi', 'Hinjawadi', now() - interval '45 minutes', now())
       ON CONFLICT (id) DO UPDATE SET
         started_at = EXCLUDED.started_at, ended_at = EXCLUDED.ended_at,
         distance_km = EXCLUDED.distance_km, duration_seconds = EXCLUDED.duration_seconds,
         avg_speed_kph = EXCLUDED.avg_speed_kph, max_speed_kph = EXCLUDED.max_speed_kph,
         idle_seconds = EXCLUDED.idle_seconds,
         start_latitude = EXCLUDED.start_latitude, start_longitude = EXCLUDED.start_longitude,
         end_latitude = EXCLUDED.end_latitude, end_longitude = EXCLUDED.end_longitude,
         updated_at = now()`,
      [
        TRIP_ID,
        ORG_GEOVENTRA,
        VEHICLE_1,
        'd1000000-0000-4000-8000-000000000001',
        startTime.toISOString(),
        endTime.toISOString(),
        round2(distanceKm),
        durationSeconds,
        round2(avgSpeed),
        route[0]![0],
        route[0]![1],
        route[route.length - 1]![0],
        route[route.length - 1]![1],
      ],
    );

    for (let i = 0; i < route.length; i += 1) {
      const progress = i / (route.length - 1);
      const recordedAt = new Date(startTime.getTime() + progress * (endTime.getTime() - startTime.getTime()));
      const pointOdometer = startOdo + distanceKm * 1000 * progress;
      await client.query(
        `INSERT INTO geoventra.gps_positions
           (id, organisation_id, vehicle_id, device_id, position, latitude, longitude, speed_kph,
            heading, ignition, accuracy_m, gps_signal, satellites, battery_voltage, odometer_km,
            engine_hours, source, event_id, recorded_at)
         VALUES ($1, $2, $3, $4,
                 ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography, $5, $6,
                 $7, 45, TRUE, 6.0, 'ok', 15, 13.0, $8, $9, 'http', $10, $11)
         ON CONFLICT DO NOTHING`,
        [
          `22100000-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`,
          ORG_GEOVENTRA,
          VEHICLE_1,
          DEVICE_GPS,
          route[i]![0],
          route[i]![1],
          round2(18 + progress * 44), // ramps 18 → 62 kph
          round2(pointOdometer),
          round2(3120.3 + (distanceKm * 1000 * progress) / 100),
          `e2e:trip:${i}`,
          recordedAt.toISOString(),
        ],
      );
    }
    await client.query(
      `UPDATE geoventra.trips
          SET end_position = ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        WHERE id = $3`,
      [route[route.length - 1]![0], route[route.length - 1]![1], TRIP_ID],
    );

    // ── Second organisation (empty fleet) for the authorization test ─────────
    await client.query(
      `INSERT INTO geoventra.organisations (id, name, slug, timezone, currency, country)
       VALUES ($1, 'Northstar Logistics', 'northstar', 'Asia/Kolkata', 'INR', 'IN')
       ON CONFLICT (id) DO NOTHING`,
      [ORG_NORTHSTAR],
    );
    await client.query(
      `INSERT INTO geoventra.roles (id, organisation_id, name, description, is_system)
       VALUES ($1, $2, 'admin', 'Full access', TRUE)
       ON CONFLICT (id) DO NOTHING`,
      ['b2000000-0000-4000-8000-0000000000aa', ORG_NORTHSTAR],
    );
    const northstarRoleResult = await client.query<{ id: string }>(
      `SELECT id FROM geoventra.roles WHERE organisation_id = $1 AND name = 'admin'`,
      [ORG_NORTHSTAR],
    );
    const northstarRoleId = northstarRoleResult.rows[0]?.id;
    if (northstarRoleId) {
      const passwordHash = hashPassword('Geoventra@2026');
      await client.query(
        `INSERT INTO geoventra.users (id, organisation_id, role_id, name, email, phone, password_hash, status)
         VALUES ($1, $2, $3, 'Northstar Admin', 'admin@northstar.in', '+91 9000000009', $4, 'active')
         ON CONFLICT (id) DO UPDATE SET password_hash = EXCLUDED.password_hash`,
        ['c2000000-0000-4000-8000-0000000000aa', ORG_NORTHSTAR, northstarRoleId, passwordHash],
      );
      // Grant the northstar admin everything the org needs.
      await client.query(
        `INSERT INTO geoventra.role_permissions (role_id, permission_id)
         SELECT $1, p.id FROM geoventra.permissions p
         ON CONFLICT DO NOTHING`,
        [northstarRoleId],
      );
    }
  } finally {
    await client.end();
  }
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_008.8;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
