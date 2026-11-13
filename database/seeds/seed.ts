/**
 * GEOVENTRA — development seed data.
 *
 * Inserts the reference data a fresh environment needs: the organisation, the
 * 29 system permissions, the four system roles, one user per role, a small
 * fleet with its driver, devices, a geofence, a service schedule and a
 * maintenance record.
 *
 * Usage:
 *   tsx database/seeds/seed.ts --database postgresql://localhost:5432/geoventra
 *
 * The script is idempotent: every record is looked up by its natural key and
 * refreshed in place, so it can be run as often as needed.
 */

import { createHash } from 'node:crypto';

import pg from 'pg';

import { hashPassword, verifyPassword } from '../hash.js';

const { Client } = pg;

const DEFAULT_DATABASE_URL = 'postgresql://localhost:5432/geoventra';
const DEFAULT_PASSWORD = 'Geoventra@2026';
const SCHEMA = 'geoventra';

type RoleName = 'owner' | 'admin' | 'manager' | 'viewer';

interface PermissionDefinition {
  code: string;
  description: string;
}

interface SeedOptions {
  databaseUrl: string;
}

/** The 32 permissions recognised by the platform. */
const PERMISSIONS: readonly PermissionDefinition[] = [
  { code: 'alerts.read', description: 'View alerts' },
  { code: 'alerts.write', description: 'Acknowledge and resolve alerts' },
  { code: 'apikeys.read', description: 'View API keys' },
  { code: 'apikeys.write', description: 'Create and revoke API keys' },
  { code: 'audit.read', description: 'View the audit log' },
  { code: 'dashboard.read', description: 'View dashboard summaries and charts' },
  { code: 'devices.read', description: 'View GPS devices and assignments' },
  { code: 'devices.write', description: 'Register, assign and remove GPS devices' },
  { code: 'drivers.read', description: 'View drivers and safety summaries' },
  { code: 'drivers.write', description: 'Create, update and delete drivers' },
  { code: 'engine.read', description: 'Read engine diagnostics, DTCs, freeze frames, health charts and alerts' },
  { code: 'engine.write', description: 'Acknowledge and resolve engine DTCs and alerts' },
  { code: 'engine.ingest', description: 'Submit engine telemetry and DTCs through the ingest endpoint' },
  { code: 'geofences.read', description: 'View geofences and geofence events' },
  { code: 'geofences.write', description: 'Create, update and delete geofences' },
  { code: 'maintenance.read', description: 'View maintenance history and schedules' },
  { code: 'maintenance.write', description: 'Record maintenance and manage schedules' },
  { code: 'org.read', description: 'View organisation profile' },
  { code: 'org.write', description: 'Update organisation profile' },
  { code: 'reports.read', description: 'Generate and export reports' },
  { code: 'roles.read', description: 'View roles and permissions' },
  { code: 'roles.write', description: 'Change role permission assignments' },
  { code: 'settings.read', description: 'View organisation settings' },
  { code: 'settings.write', description: 'Update organisation settings' },
  { code: 'simulator.control', description: 'Start, stop and reset the demo GPS simulator' },
  { code: 'tracking.read', description: 'View live positions and vehicle trails' },
  { code: 'trips.export', description: 'Export trip data as CSV' },
  { code: 'trips.read', description: 'View trips and playback' },
  { code: 'users.read', description: 'View organisation users' },
  { code: 'users.write', description: 'Invite, update and remove users' },
  { code: 'vehicles.read', description: 'View vehicles and vehicle details' },
  { code: 'vehicles.write', description: 'Create, update and delete vehicles' },
] as const;

const ALL_PERMISSION_CODES: readonly string[] = PERMISSIONS.map((permission) => permission.code);

/** Permissions the administrator role is not allowed to use. */
const ADMIN_EXCLUDED_CODES: readonly string[] = ['org.write', 'settings.write', 'audit.read'];

/** Permissions that describe day to day fleet operations. */
const MANAGER_CODES: readonly string[] = [
  'dashboard.read',
  'tracking.read',
  'trips.read',
  'trips.export',
  'alerts.read',
  'alerts.write',
  'devices.read',
  'devices.write',
  'drivers.read',
  'drivers.write',
  'engine.read',
  'engine.write',
  'geofences.read',
  'geofences.write',
  'maintenance.read',
  'maintenance.write',
  'vehicles.read',
  'vehicles.write',
  'reports.read',
];

/** Permissions the viewer role is allowed to use. */
const VIEWER_CODES: readonly string[] = ALL_PERMISSION_CODES.filter((code) => code.endsWith('.read'));

interface RoleDefinition {
  name: RoleName;
  description: string;
  codes: readonly string[];
}

const ROLES: readonly RoleDefinition[] = [
  {
    name: 'owner',
    description: 'Unrestricted access to every organisation capability',
    codes: ALL_PERMISSION_CODES,
  },
  {
    name: 'admin',
    description: 'Administers users, roles, fleet and devices',
    codes: ALL_PERMISSION_CODES.filter((code) => !ADMIN_EXCLUDED_CODES.includes(code)),
  },
  {
    name: 'manager',
    description: 'Runs the day to day fleet operations',
    codes: MANAGER_CODES,
  },
  {
    name: 'viewer',
    description: 'Read only access to the fleet',
    codes: VIEWER_CODES,
  },
] as const;

/** Deterministic identifiers keep the seed idempotent across runs. */
const IDS = {
  organisation: 'a1000000-0000-4000-8000-000000000001',
  roles: {
    owner: 'b1000000-0000-4000-8000-000000000001',
    admin: 'b1000000-0000-4000-8000-000000000002',
    manager: 'b1000000-0000-4000-8000-000000000003',
    viewer: 'b1000000-0000-4000-8000-000000000004',
  },
  users: {
    owner: 'c1000000-0000-4000-8000-000000000001',
    admin: 'c1000000-0000-4000-8000-000000000002',
    manager: 'c1000000-0000-4000-8000-000000000003',
    viewer: 'c1000000-0000-4000-8000-000000000004',
  },
  driver: 'd1000000-0000-4000-8000-000000000001',
  vehicles: [
    'e1000000-0000-4000-8000-000000000001',
    'e1000000-0000-4000-8000-000000000002',
    'e1000000-0000-4000-8000-000000000003',
  ],
  devices: ['f1000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002'],
  geofence: 'f2000000-0000-4000-8000-000000000001',
  serviceSchedule: 'f3000000-0000-4000-8000-000000000001',
  maintenanceRecord: 'f4000000-0000-4000-8000-000000000001',
  engine: {
    device: '11000000-0000-4000-8000-000000000001',
    dtcs: {
      misfire: '21000000-0000-4000-8000-000000000001',
      thermostat: '21000000-0000-4000-8000-000000000002',
    },
    events: {
      misfireDetected: '31000000-0000-4000-8000-000000000001',
      thermostatCleared: '31000000-0000-4000-8000-000000000002',
    },
    alerts: {
      overheating: '41000000-0000-4000-8000-000000000001',
      highRpm: '41000000-0000-4000-8000-000000000002',
    },
    telemetry: [
      '51000000-0000-4000-8000-000000000001',
      '51000000-0000-4000-8000-000000000002',
      '51000000-0000-4000-8000-000000000003',
      '51000000-0000-4000-8000-000000000004',
      '51000000-0000-4000-8000-000000000005',
      '51000000-0000-4000-8000-000000000006',
      '51000000-0000-4000-8000-000000000007',
      '51000000-0000-4000-8000-000000000008',
    ],
  },
} as const;

interface UserDefinition {
  role: RoleName;
  name: string;
  email: string;
  phone: string;
}

/** One user per system role. */
const USERS: readonly UserDefinition[] = [
  {
    role: 'owner',
    name: 'Geoventra Owner',
    email: 'owner@geoventra.in',
    phone: '+91 9000000001',
  },
  {
    role: 'admin',
    name: 'Geoventra Admin',
    email: 'admin@geoventra.in',
    phone: '+91 9000000002',
  },
  {
    role: 'manager',
    name: 'Geoventra Manager',
    email: 'manager@geoventra.in',
    phone: '+91 9000000003',
  },
  {
    role: 'viewer',
    name: 'Geoventra Viewer',
    email: 'viewer@geoventra.in',
    phone: '+91 9000000004',
  },
] as const;

interface VehicleDefinition {
  registrationNumber: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  fuelType: string;
  year: number;
  vin: string;
  city: string;
  status: string;
  odometerKm: number;
  engineHours: number;
  maintenanceStatus: string;
  fuelLevel: number;
  fuelCapacity: number;
  notes: string | null;
}

const VEHICLES: readonly VehicleDefinition[] = [
  {
    registrationNumber: 'MH 12 AB 1234',
    name: 'Pune Freight Truck 01',
    category: 'truck',
    manufacturer: 'Tata Motors',
    model: 'LPT 1613',
    fuelType: 'diesel',
    year: 2022,
    vin: 'MAT445094MNG00001',
    city: 'Pune',
    status: 'moving',
    odometerKm: 84500.5,
    engineHours: 3120.25,
    maintenanceStatus: 'ok',
    fuelLevel: 68.4,
    fuelCapacity: 250,
    notes: 'Primary long haul truck for the Mumbai corridor',
  },
  {
    registrationNumber: 'MH 12 CD 5678',
    name: 'Pune Delivery Van 02',
    category: 'van',
    manufacturer: 'Mahindra',
    model: 'Supra',
    fuelType: 'diesel',
    year: 2021,
    vin: 'MAT442024MNG00002',
    city: 'Pune',
    status: 'idle',
    odometerKm: 52120,
    engineHours: 1980.4,
    maintenanceStatus: 'due_soon',
    fuelLevel: 42.75,
    fuelCapacity: 65,
    notes: 'City distribution van',
  },
  {
    registrationNumber: 'MH 12 EF 9012',
    name: 'Pune Field Pickup 03',
    category: 'pickup',
    manufacturer: 'Isuzu',
    model: 'D-Max',
    fuelType: 'diesel',
    year: 2023,
    vin: 'MAT447032MNG00003',
    city: 'Pune',
    status: 'offline',
    odometerKm: 12300.75,
    engineHours: 410.6,
    maintenanceStatus: 'ok',
    fuelLevel: 88.2,
    fuelCapacity: 80,
    notes: 'Site inspection and tool carrier',
  },
] as const;

/**
 * Derives a stable UUID from a string.
 *
 * The seed uses it for rows that have no natural key of their own, so that a
 * second run refreshes the very same row instead of creating a duplicate.
 */
function deterministicUuid(seed: string): string {
  const hash = createHash('sha1').update(`geoventra:${seed}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    `5${hash.slice(13, 16)}`,
    `8${hash.slice(17, 20)}`,
    hash.slice(20, 32),
  ].join('-');
}

/** Parses the command line arguments supported by the seed script. */
function parseArgs(argv: string[]): SeedOptions {
  const options: SeedOptions = {
    databaseUrl: process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    switch (arg) {
      case '--database':
      case '-d':
        if (value === undefined) {
          throw new Error('Missing value for --database');
        }
        options.databaseUrl = value;
        index += 1;
        break;
      case '--help':
      case '-h':
        process.stdout.write(
          [
            'Usage: tsx database/seeds/seed.ts [options]',
            '',
            'Options:',
            '  -d, --database <url>  PostgreSQL connection string (defaults to DATABASE_URL)',
            '  -h, --help            Show this help',
            '',
          ].join('\n'),
        );
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg ?? ''}`);
    }
  }

  return options;
}

/**
 * Inserts or refreshes a row.
 *
 * The row is located by its natural key first; when it does not exist yet the
 * deterministic identifier is used instead.
 */
async function upsert(
  client: pg.Client,
  table: string,
  naturalKey: Record<string, string>,
  deterministicId: string,
  values: Record<string, unknown>,
): Promise<string> {
  const keyColumns = Object.keys(naturalKey);
  const where = keyColumns.map((column, index) => `${column} = $${index + 1}`).join(' AND ');
  const found = await client.query<{ id: string }>(
    `SELECT id FROM ${SCHEMA}.${table} WHERE ${where}`,
    Object.values(naturalKey),
  );

  const id = found.rows[0]?.id ?? deterministicId;
  const columns = Object.keys(values);
  const placeholders = columns.map((_, index) => `$${index + 2}`);
  const assignments = columns
    .filter((column) => column !== 'id')
    .map((column) => `${column} = EXCLUDED.${column}`);

  await client.query(
    `INSERT INTO ${SCHEMA}.${table} (id, ${columns.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${assignments.join(', ')}`,
    [id, ...columns.map((column) => values[column] ?? null)],
  );

  return id;
}

/** Replaces the permission mapping of a role. */
async function syncRolePermissions(
  client: pg.Client,
  roleId: string,
  permissionIds: readonly string[],
): Promise<void> {
  await client.query(`DELETE FROM ${SCHEMA}.role_permissions WHERE role_id = $1`, [roleId]);
  for (const permissionId of permissionIds) {
    await client.query(
      `INSERT INTO ${SCHEMA}.role_permissions (role_id, permission_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [roleId, permissionId],
    );
  }
}

/**
 * Inserts or refreshes the seeded geofence.
 *
 * The centre point is a PostGIS geography value, so it is built by the
 * database instead of being passed as a parameter.
 */
async function upsertGeofence(client: pg.Client, organisationId: string): Promise<void> {
  const latitude = 18.5204;
  const longitude = 73.8567;

  const found = await client.query<{ id: string }>(
    `SELECT id FROM ${SCHEMA}.geofences WHERE organisation_id = $1 AND name = $2`,
    [organisationId, 'Pune Depot'],
  );
  const id = found.rows[0]?.id ?? IDS.geofence;

  await client.query(
    `INSERT INTO ${SCHEMA}.geofences
       (id, organisation_id, name, description, type, center, center_latitude,
        center_longitude, radius_m, color, alert_on_entry, alert_on_exit,
        is_active, created_by)
     VALUES ($1, $2, 'Pune Depot', 'Primary loading yard in Hinjewadi, Pune', 'circle',
             public.ST_SetSRID(public.ST_MakePoint($3, $4), 4326)::public.geography,
             $4, $3, 1500, '#0d9488', true, false, true, $5)
     ON CONFLICT (id) DO UPDATE SET
       description = EXCLUDED.description,
       type = EXCLUDED.type,
       center = EXCLUDED.center,
       center_latitude = EXCLUDED.center_latitude,
       center_longitude = EXCLUDED.center_longitude,
       radius_m = EXCLUDED.radius_m,
       color = EXCLUDED.color,
       alert_on_entry = EXCLUDED.alert_on_entry,
       alert_on_exit = EXCLUDED.alert_on_exit,
       is_active = EXCLUDED.is_active,
       created_by = EXCLUDED.created_by`,
    [id, organisationId, longitude, latitude, IDS.users.owner],
  );
}

/**
 * Seeds the engine diagnostics domain so a fresh database demonstrates Phase 5.1:
 *
 *   • one OBD device bound to the first seeded vehicle,
 *   • eight telemetry readings (two snapshots: one unhealthy, one healthy),
 *   • one active DTC (P0300, MIL on, with a freeze frame) and one cleared DTC (P0128),
 *   • the lifecycle events those DTCs would have produced,
 *   • two open health alerts (engine overheating and high RPM).
 *
 * All writes are upserts against deterministic identifiers, so the seed stays idempotent.
 */
async function seedEngineDiagnostics(
  client: pg.Client,
  organisationId: string,
  vehicleIds: readonly string[],
): Promise<void> {
  const primary = vehicleIds[0];
  const secondary = vehicleIds[1];
  if (!primary) return;

  // The OBD device is registered separately; bind it to the first vehicle here.
  await client.query(
    `UPDATE ${SCHEMA}.device_assignments
        SET unassigned_at = NULL, vehicle_id = $2
      WHERE organisation_id = $1
        AND vehicle_id = $3`,
    [organisationId, primary, primary],
  );

  await upsert(
    client,
    'engine_devices',
    { organisation_id: organisationId, device_id: 'GEO-OBD-0001' },
    IDS.engine.device,
    {
      organisation_id: organisationId,
      vehicle_id: primary,
      device_id: 'GEO-OBD-0001',
      device_type: 'obd_dongle',
      protocol: 'obd2',
      manufacturer: 'Geoventra',
      model: 'GV-OBD Pro',
      firmware_version: '2.1.0',
      status: 'online',
      last_seen_at: new Date().toISOString(),
      config: { pidPollingIntervalMs: 1000, protocol: 'ISO15765-4 (CAN 11/500)' },
    },
  );

  // Telemetry — two snapshots. The unhealthy one trips the built-in rules; the
  // healthy one shows the counters the rules use for auto-recovery.
  const readings: Array<{ id: string; vehicleId: string; metric: string; value: number; unit: string; recordedAgoSeconds: number }> = [
    { id: IDS.engine.telemetry[0], vehicleId: primary, metric: 'engine_rpm', value: 6500, unit: 'rpm', recordedAgoSeconds: 60 },
    { id: IDS.engine.telemetry[1], vehicleId: primary, metric: 'coolant_temp_c', value: 110, unit: '°C', recordedAgoSeconds: 60 },
    { id: IDS.engine.telemetry[2], vehicleId: primary, metric: 'battery_voltage_v', value: 11.2, unit: 'V', recordedAgoSeconds: 60 },
    { id: IDS.engine.telemetry[3], vehicleId: primary, metric: 'engine_load_pct', value: 78, unit: '%', recordedAgoSeconds: 60 },
    ...(secondary
      ? [
          { id: IDS.engine.telemetry[4], vehicleId: secondary, metric: 'engine_rpm', value: 2100, unit: 'rpm', recordedAgoSeconds: 300 },
          { id: IDS.engine.telemetry[5], vehicleId: secondary, metric: 'coolant_temp_c', value: 88, unit: '°C', recordedAgoSeconds: 300 },
          { id: IDS.engine.telemetry[6], vehicleId: secondary, metric: 'battery_voltage_v', value: 13.8, unit: 'V', recordedAgoSeconds: 300 },
          { id: IDS.engine.telemetry[7], vehicleId: secondary, metric: 'engine_load_pct', value: 34, unit: '%', recordedAgoSeconds: 300 },
        ]
      : []),
  ];

  for (const reading of readings) {
    await client.query(
      `INSERT INTO ${SCHEMA}.engine_telemetry_readings
         (id, organisation_id, vehicle_id, device_id, metric, value, unit,
          source_classification, data_quality, recorded_at)
       VALUES ($1, $2, $3, 'GEO-OBD-0001', $4, $5, $6, 'simulated', 'good',
               now() - ($7 || ' seconds')::interval)
       ON CONFLICT (id) DO UPDATE SET value = EXCLUDED.value, unit = EXCLUDED.unit,
         recorded_at = EXCLUDED.recorded_at`,
      [reading.id, organisationId, reading.vehicleId, reading.metric, reading.value, reading.unit, String(reading.recordedAgoSeconds)],
    );
  }

  const freezeFrame = {
    capturedAt: new Date(Date.now() - 60_000).toISOString(),
    source: 'dtc_trigger' as const,
    metrics: { engine_rpm: 6500, coolant_temp_c: 110, battery_voltage_v: 11.2, engine_load_pct: 78 },
    vehicleState: {
      speedKph: 0,
      rpm: 6500,
      loadPct: 78,
      coolantTempC: 110,
      fuelLevelPct: 64,
      ignition: true,
      odometerKm: 42_500,
      latitude: 19.076,
      longitude: 72.8777,
      heading: 87,
    },
  };

  // DTC lifecycle: one active misfire (MIL on) with a freeze frame, one cleared thermostat code.
  await upsert(
    client,
    'engine_dtcs',
    { organisation_id: organisationId, vehicle_id: primary, code: 'P0300' },
    IDS.engine.dtcs.misfire,
    {
      organisation_id: organisationId,
      vehicle_id: primary,
      code: 'P0300',
      category: 'P',
      description: 'Random/multiple cylinder misfire detected',
      severity: 'critical',
      status: 'active',
      mil_on: true,
      first_detected_at: new Date(Date.now() - 86_400_000).toISOString(),
      last_detected_at: new Date(Date.now() - 60_000).toISOString(),
      occurrence_count: 3,
      freeze_frame: JSON.stringify(freezeFrame),
    },
  );

  if (secondary) {
    await upsert(
      client,
      'engine_dtcs',
      { organisation_id: organisationId, vehicle_id: secondary, code: 'P0128' },
      IDS.engine.dtcs.thermostat,
      {
        organisation_id: organisationId,
        vehicle_id: secondary,
        code: 'P0128',
        category: 'P',
        description: 'Coolant thermostat (coolant temperature below thermostat regulating temperature)',
        severity: 'warning',
        status: 'cleared',
        mil_on: false,
        first_detected_at: new Date(Date.now() - 172_800_000).toISOString(),
        last_detected_at: new Date(Date.now() - 86_400_000).toISOString(),
        occurrence_count: 1,
        freeze_frame: JSON.stringify({
          capturedAt: new Date(Date.now() - 86_400_000).toISOString(),
          source: 'dtc_trigger' as const,
          metrics: { engine_rpm: 800, engine_load_pct: 20, vehicle_speed_kph: 0, coolant_temp_c: 70 },
          vehicleState: null,
        }),
        acknowledged: true,
        acknowledged_at: new Date(Date.now() - 86_000_000).toISOString(),
        resolved: true,
        resolved_at: new Date(Date.now() - 86_000_000).toISOString(),
      },
    );
  }

  await client.query(
    `INSERT INTO ${SCHEMA}.engine_dtc_events
       (id, organisation_id, vehicle_id, dtc_id, code, event_type, recorded_at, metadata)
     VALUES
       ($1, $2, $3, (SELECT id FROM ${SCHEMA}.engine_dtcs WHERE organisation_id = $2 AND vehicle_id = $3 AND code = 'P0300'),
        'P0300', 'detected', now() - interval '1 day', '{"occurrenceCount": 1, "source": "seed"}'::jsonb),
       ($4, $2, $3, (SELECT id FROM ${SCHEMA}.engine_dtcs WHERE organisation_id = $2 AND vehicle_id = $3 AND code = 'P0300'),
        'P0300', 'updated', now() - interval '1 minute', '{"occurrenceCount": 3, "source": "seed"}'::jsonb)
     ON CONFLICT (id) DO NOTHING`,
    [IDS.engine.events.misfireDetected, organisationId, primary, IDS.engine.events.thermostatCleared],
  );

  await client.query(
    `INSERT INTO ${SCHEMA}.engine_health_alerts
       (id, organisation_id, vehicle_id, rule_id, severity, title, description,
        observed_value, observed_unit, threshold_value, first_occurrence_at, last_occurrence_at,
        occurrence_count, source_classification, related_metric)
     VALUES
       ($1, $2, $3, 'engine_overheating', 'critical', 'Engine overheating',
        'Coolant temperature exceeded the safe operating range', 110, '°C', 105,
        now() - interval '1 hour', now() - interval '1 minute', 2, 'simulated', 'coolant_temp_c'),
       ($4, $2, $3, 'high_rpm', 'warning', 'High engine RPM',
        'Engine speed exceeded the configured limit', 6500, 'rpm', 6000,
        now() - interval '1 hour', now() - interval '1 minute', 1, 'simulated', 'engine_rpm')
     ON CONFLICT (organisation_id, vehicle_id, rule_id) DO UPDATE
       SET observed_value = EXCLUDED.observed_value,
           observed_unit = EXCLUDED.observed_unit,
           last_occurrence_at = EXCLUDED.last_occurrence_at,
           occurrence_count = EXCLUDED.occurrence_count,
           updated_at = now()`,
    [IDS.engine.alerts.overheating, organisationId, primary, IDS.engine.alerts.highRpm],
  );
}

/** Seeds every record and returns a short summary of the run. */
async function seed(client: pg.Client): Promise<string[]> {
  const summary: string[] = [];

  const organisationId = await upsert(
    client,
    'organisations',
    { slug: 'geoventra' },
    IDS.organisation,
    {
      name: 'Geoventra Logistics',
      slug: 'geoventra',
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      country: 'IN',
      settings: {},
    },
  );
  summary.push(`organisation Geoventra Logistics (${organisationId})`);

  const permissionIds = new Map<string, string>();
  for (const permission of PERMISSIONS) {
    const permissionId = await upsert(
      client,
      'permissions',
      { code: permission.code },
      deterministicUuid(`permission:${permission.code}`),
      { code: permission.code, description: permission.description },
    );
    permissionIds.set(permission.code, permissionId);
  }
  summary.push(`${PERMISSIONS.length} permissions`);

  const roleIds = new Map<RoleName, string>();
  for (const role of ROLES) {
    const roleId = await upsert(
      client,
      'roles',
      { organisation_id: organisationId, name: role.name },
      IDS.roles[role.name],
      {
        organisation_id: organisationId,
        name: role.name,
        description: role.description,
        is_system: true,
      },
    );
    roleIds.set(role.name, roleId);

    const codes = role.codes.map((code) => {
      const permissionId = permissionIds.get(code);
      if (permissionId === undefined) {
        throw new Error(`Unknown permission code: ${code}`);
      }
      return permissionId;
    });
    await syncRolePermissions(client, roleId, codes);
    summary.push(`role ${role.name} (${role.codes.length} permissions)`);
  }

  for (const user of USERS) {
    const roleId = roleIds.get(user.role);
    if (roleId === undefined) {
      throw new Error(`Unknown role: ${user.role}`);
    }

    const existing = await client.query<{ id: string; password_hash: string }>(
      `SELECT id, password_hash FROM ${SCHEMA}.users WHERE organisation_id = $1 AND email = $2`,
      [organisationId, user.email],
    );

    let passwordHash: string;
    const current = existing.rows[0];
    if (current !== undefined && verifyPassword(DEFAULT_PASSWORD, current.password_hash)) {
      passwordHash = current.password_hash;
    } else {
      passwordHash = hashPassword(DEFAULT_PASSWORD);
    }

    await upsert(
      client,
      'users',
      { organisation_id: organisationId, email: user.email },
      IDS.users[user.role],
      {
        organisation_id: organisationId,
        role_id: roleId,
        name: user.name,
        email: user.email,
        phone: user.phone,
        password_hash: passwordHash,
        status: 'active',
        preferences: { theme: 'system', density: 'comfortable' },
      },
    );
    summary.push(`user ${user.email}`);
  }

  const driverId = await upsert(
    client,
    'drivers',
    { organisation_id: organisationId, license_number: 'MH-2016-1000000' },
    IDS.driver,
    {
      organisation_id: organisationId,
      name: 'Vivaan Patel',
      phone: '+91 9100000000',
      email: 'vivaan.patel@geoventra.in',
      license_number: 'MH-2016-1000000',
      license_expiry: '2029-04-30',
      status: 'active',
      safety_score: 96,
      address: 'Baner, Pune, Maharashtra 411045',
      joined_at: '2021-06-01',
    },
  );
  summary.push('driver Vivaan Patel');

  const vehicleIds: string[] = [];
  for (const [index, vehicle] of VEHICLES.entries()) {
    const vehicleId = await upsert(
      client,
      'vehicles',
      { organisation_id: organisationId, registration_number: vehicle.registrationNumber },
      IDS.vehicles[index] ?? IDS.vehicles[0],
      {
        organisation_id: organisationId,
        registration_number: vehicle.registrationNumber,
        name: vehicle.name,
        category: vehicle.category,
        manufacturer: vehicle.manufacturer,
        model: vehicle.model,
        fuel_type: vehicle.fuelType,
        year: vehicle.year,
        vin: vehicle.vin,
        city: vehicle.city,
        assigned_driver_id: index === 0 ? driverId : null,
        status: vehicle.status,
        odometer_km: vehicle.odometerKm,
        engine_hours: vehicle.engineHours,
        maintenance_status: vehicle.maintenanceStatus,
        fuel_level: vehicle.fuelLevel,
        fuel_capacity: vehicle.fuelCapacity,
        fuel_level_last_updated: new Date().toISOString(),
        notes: vehicle.notes,
      },
    );
    vehicleIds.push(vehicleId);
  }
  summary.push(`${VEHICLES.length} vehicles`);

  const gpsTrackerId = await upsert(
    client,
    'devices',
    { device_id: 'GEO-GPS-0001' },
    IDS.devices[0],
    {
      organisation_id: organisationId,
      device_id: 'GEO-GPS-0001',
      device_type: 'gps_tracker',
      imei: '352094001234567',
      model: 'GV-Tracker X1',
      firmware_version: '1.4.2',
      provider: 'geoventra',
      status: 'online',
      last_communication_at: new Date().toISOString(),
      config: {},
      serial_number: 'SN-GPS-0001',
      mac_address: '7C:2E:BD:11:00:01',
      installation_date: '2023-04-12',
      installed_at_location: 'Pune Depot',
      metadata: {},
    },
  );
  summary.push('device GEO-GPS-0001 (gps_tracker)');

  await upsert(
    client,
    'devices',
    { device_id: 'GEO-OBD-0001' },
    IDS.devices[1],
    {
      organisation_id: organisationId,
      device_id: 'GEO-OBD-0001',
      device_type: 'obd_dongle',
      imei: '868694003214568',
      model: 'GV-OBD Pro',
      firmware_version: '2.1.0',
      provider: 'geoventra',
      status: 'offline',
      config: {},
      serial_number: 'SN-OBD-0001',
      mac_address: '7C:2E:BD:11:00:02',
      installation_date: '2024-01-22',
      installed_at_location: 'Pune Depot',
      metadata: {},
    },
  );
  summary.push('device GEO-OBD-0001 (obd_dongle)');

  await client.query(
    `INSERT INTO ${SCHEMA}.device_assignments
       (id, organisation_id, device_id, vehicle_id, assigned_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (id) DO UPDATE SET vehicle_id = EXCLUDED.vehicle_id`,
    [
      'f5000000-0000-4000-8000-000000000001',
      organisationId,
      gpsTrackerId,
      vehicleIds[0] ?? null,
    ],
  );

  await upsertGeofence(client, organisationId);
  summary.push('geofence Pune Depot');

  await seedEngineDiagnostics(client, organisationId, vehicleIds);
  summary.push('engine diagnostics (telemetry, DTC lifecycle, alerts, freeze frame)');

  await upsert(
    client,
    'service_schedules',
    { vehicle_id: vehicleIds[0] ?? '', name: 'Periodic Service A' },
    IDS.serviceSchedule,
    {
      organisation_id: organisationId,
      vehicle_id: vehicleIds[0] ?? null,
      name: 'Periodic Service A',
      interval_km: 10000,
      interval_days: 90,
      last_service_at: '2026-08-15',
      last_service_km: 78000,
      next_due_at: '2026-11-15',
      next_due_km: 88000,
      status: 'ok',
      notes: 'Includes oil, filters and brake inspection',
      interval_engine_hours: 250,
      last_service_engine_hours: 2900,
    },
  );
  summary.push('service schedule Periodic Service A');

  await upsert(
    client,
    'maintenance_records',
    { organisation_id: organisationId, vehicle_id: vehicleIds[0] ?? '', performed_at: '2026-08-15' },
    IDS.maintenanceRecord,
    {
      organisation_id: organisationId,
      vehicle_id: vehicleIds[0] ?? null,
      type: 'service',
      description: 'Scheduled 10000 km service',
      vendor: 'Pune Auto Works',
      odometer_km: 78000,
      cost: 18500,
      performed_at: '2026-08-15',
      status: 'completed',
      created_by: IDS.users.owner,
    },
  );
  summary.push('maintenance record Scheduled 10000 km service');

  return summary;
}

/** Entry point. */
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const client = new Client({ connectionString: options.databaseUrl });
  await client.connect();

  try {
    await client.query('BEGIN');
    const summary = await seed(client);
    await client.query('COMMIT');

    process.stdout.write(`Seeded ${summary.length} record groups:\n`);
    for (const line of summary) {
      process.stdout.write(`  - ${line}\n`);
    }
    process.stdout.write(`\nEvery seeded user uses the password "${DEFAULT_PASSWORD}".\n`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Seed failed: ${message}\n`);
  process.exitCode = 1;
});
