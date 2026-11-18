/**
 * GEOVENTRA — shared domain vocabulary and API payload types.
 * These types are the contract between the NestJS API and the Next.js client.
 */

export const VEHICLE_CATEGORIES = [
  'car',
  'truck',
  'trailer_truck',
  'bus',
  'van',
  'pickup',
  'motorcycle',
  'tractor',
  'construction',
] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

export const VEHICLE_STATUSES = ['moving', 'idle', 'stopped', 'offline'] as const;
export type VehicleStatus = (typeof VEHICLE_STATUSES)[number];

export const FUEL_TYPES = ['petrol', 'diesel', 'cng', 'electric', 'hybrid'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const MAINTENANCE_STATUSES = ['ok', 'due_soon', 'overdue', 'in_service'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const DRIVER_STATUSES = ['active', 'on_leave', 'inactive'] as const;
export type DriverStatus = (typeof DRIVER_STATUSES)[number];

export const DEVICE_TYPES = ['gps_tracker', 'obd_dongle', 'asset_tag'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_STATUSES = ['online', 'offline', 'degraded', 'unassigned'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const TRIP_STATUSES = ['active', 'completed', 'cancelled'] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

export const TRIP_EVENT_TYPES = [
  'ignition_on',
  'ignition_off',
  'stop',
  'harsh_braking',
  'harsh_acceleration',
  'speeding',
  'idling',
  'geofence_entry',
  'geofence_exit',
] as const;
export type TripEventType = (typeof TRIP_EVENT_TYPES)[number];

export const GEOFENCE_TYPES = ['circle', 'polygon'] as const;
export type GeofenceType = (typeof GEOFENCE_TYPES)[number];

export const GEOFENCE_EVENT_TYPES = ['entry', 'exit'] as const;
export type GeofenceEventType = (typeof GEOFENCE_EVENT_TYPES)[number];

export const ALERT_TYPES = [
  'overspeed',
  'harsh_braking',
  'harsh_acceleration',
  'long_idling',
  'unauthorized_movement',
  'geofence_entry',
  'geofence_exit',
  'device_offline',
  'low_battery',
  'maintenance_due',
  'stop',
  'fuel_theft',
  'tire_heating',
  // TPMS (P2)
  'tpms_low_pressure',
  'tpms_high_pressure',
  'tpms_rapid_pressure_loss',
  'tpms_high_temperature',
  'tpms_critical_temperature',
  'tpms_sensor_battery_low',
  'tpms_sensor_offline',
  'tpms_sensor_tampering',
  'tpms_repeated_pressure_loss',
] as const;
export type AlertType = (typeof ALERT_TYPES)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low'] as const;
export type Severity = (typeof SEVERITIES)[number];

export const ALERT_STATUSES = ['open', 'acknowledged', 'resolved'] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const USER_STATUSES = ['active', 'invited', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'email', 'sms'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const ROLE_NAMES = ['owner', 'admin', 'manager', 'viewer'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const PERMISSIONS = [
  'dashboard.read',
  'vehicles.read',
  'vehicles.write',
  'engine.read',
  'engine.write',
  'engine.ingest',
  'drivers.read',
  'drivers.write',
  'devices.read',
  'devices.write',
  'tracking.read',
  'tracking.export',
  'trips.read',
  'trips.export',
  'geofences.read',
  'geofences.write',
  'alerts.read',
  'alerts.write',
  'reports.read',
  'maintenance.read',
  'maintenance.write',
  'tpms.read',
  'tpms.write',
  'tpms.ingest',
  'users.read',
  'users.write',
  'roles.read',
  'roles.write',
  'org.read',
  'org.write',
  'apikeys.read',
  'apikeys.write',
  'audit.read',
  'settings.read',
  'settings.write',
  'simulator.control',
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const REPORT_KEYS = [
  'distance',
  'utilisation',
  'idle',
  'trips',
  'driver-performance',
  'speeding',
  'geofence',
  'fleet-activity',
  'vehicle-status',
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

// ── API envelopes ─────────────────────────────────────────────────────────────

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  details?: unknown;
  requestId: string;
  timestamp: string;
  path: string;
}

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  organisationId: string;
  name: string;
  email: string;
  role: RoleName;
  roleId: string;
  permissions: Permission[];
  avatarUrl: string | null;
}

export interface OrganisationSummary {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  country: string;
  logoUrl: string | null;
  createdAt: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
  user: AuthUser;
  organisation: OrganisationSummary;
}

// ── Fleet ─────────────────────────────────────────────────────────────────────

export interface VehicleSummary {
  id: string;
  registrationNumber: string;
  name: string;
  category: VehicleCategory;
  manufacturer: string;
  model: string;
  fuelType: FuelType;
  year: number;
  status: VehicleStatus;
  odometerKm: number;
  engineHours: number;
  maintenanceStatus: MaintenanceStatus;
  groupId: string | null;
  groupName: string | null;
  city: string | null;
  assignedDriverId: string | null;
  assignedDriverName: string | null;
  deviceId: string | null;
  deviceSerial: string | null;
  deviceStatus: DeviceStatus | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  lastSpeedKph: number | null;
  lastHeading: number | null;
  lastIgnition: boolean | null;
  lastBatteryVoltage: number | null;
  lastRecordedAt: string | null;
  activeFlag: boolean;
  createdAt: string;
}

export interface VehicleHealth {
  deviceConnectivity: 'online' | 'offline' | 'degraded';
  batteryVoltage: number | null;
  batteryStatus: 'good' | 'low' | 'critical' | 'unknown';
  serviceStatus: MaintenanceStatus;
  lastServiceAt: string | null;
  nextServiceDueKm: number | null;
  nextServiceDueAt: string | null;
  openAlertCount: number;
  note: string;
}

export interface VehicleDetail extends VehicleSummary {
  vin: string;
  insuranceExpiry: string | null;
  registrationExpiry: string | null;
  notes: string | null;
  health: VehicleHealth;
  driver: DriverSummary | null;
  device: DeviceSummary | null;
}

export interface DriverSummary {
  id: string;
  name: string;
  phone: string;
  email: string;
  licenseNumber: string;
  licenseExpiry: string;
  status: DriverStatus;
  safetyScore: number;
  assignedVehicleId: string | null;
  assignedVehicleRegistration: string | null;
  trips30d: number;
  distance30dKm: number;
  harshBraking30d: number;
  harshAcceleration30d: number;
  speeding30d: number;
  activeFlag: boolean;
  createdAt: string;
}

export interface DriverDetail extends DriverSummary {
  photoUrl: string | null;
  address: string | null;
  joinedAt: string;
  trips7d: number;
  distance7dKm: number;
  safetyTrend: { date: string; score: number }[];
  recentEvents: DriverEvent[];
}

export interface DriverEvent {
  id: string;
  type: TripEventType;
  severity: Severity;
  vehicleRegistration: string | null;
  occurredAt: string;
  speedKph: number | null;
  latitude: number | null;
  longitude: number | null;
}

// ── Live tracking ─────────────────────────────────────────────────────────────

export interface LivePosition {
  vehicleId: string;
  registrationNumber: string;
  name: string;
  category: VehicleCategory;
  status: VehicleStatus;
  /** Latitude in degrees, or null when the vehicle has no GPS fix. */
  latitude: number | null;
  /** Longitude in degrees, or null when the vehicle has no GPS fix. */
  longitude: number | null;
  speedKph: number;
  heading: number;
  ignition: boolean;
  batteryVoltage: number | null;
  gpsSignal: 'ok' | 'weak' | 'none';
  accuracyM: number | null;
  driverId: string | null;
  driverName: string | null;
  groupName: string | null;
  city: string | null;
  odometerKm: number;
  /** Number of alerts currently open for this vehicle (for marker alert state). */
  openAlertCount: number;
  /** Tracker bound to this vehicle, if any. */
  deviceId: string | null;
  deviceStatus: string | null;
  recordedAt: string;
  ageSeconds: number;
}

export interface TrackingSnapshot {
  positions: LivePosition[];
  geofences: GeofenceSummary[];
  serverTime: string;
}

export interface TrackPoint {
  latitude: number;
  longitude: number;
  speedKph: number;
  heading: number;
  ignition: boolean;
  recordedAt: string;
}

// ── Trips ─────────────────────────────────────────────────────────────────────

export interface TripSummary {
  id: string;
  vehicleId: string;
  vehicleRegistration: string;
  vehicleName: string;
  driverId: string | null;
  driverName: string | null;
  status: TripStatus;
  startedAt: string;
  endedAt: string | null;
  distanceKm: number;
  durationSeconds: number;
  avgSpeedKph: number;
  maxSpeedKph: number;
  idleSeconds: number;
  startLatitude: number;
  startLongitude: number;
  endLatitude: number | null;
  endLongitude: number | null;
  startLabel: string;
  endLabel: string | null;
  eventCount: number;
}

export interface TripDetail extends TripSummary {
  points: TrackPoint[];
  stops: TripStop[];
  events: TripEvent[];
}

export interface TripStop {
  latitude: number;
  longitude: number;
  startedAt: string;
  durationSeconds: number;
  label: string;
}

export interface TripEvent {
  id: string;
  type: TripEventType;
  severity: Severity | null;
  speedKph: number | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

// ── Geofences ─────────────────────────────────────────────────────────────────

export interface GeofenceSummary {
  id: string;
  name: string;
  description: string | null;
  type: GeofenceType;
  centerLatitude: number;
  centerLongitude: number;
  radiusM: number | null;
  geometry: { type: 'Polygon'; coordinates: number[][][] } | null;
  color: string;
  alertOnEntry: boolean;
  alertOnExit: boolean;
  isActive: boolean;
  scope: 'all' | 'selected';
  vehicleCount: number;
  createdAt: string;
}

export interface GeofenceEvent {
  id: string;
  geofenceId: string;
  geofenceName: string;
  vehicleId: string;
  vehicleRegistration: string;
  eventType: GeofenceEventType;
  latitude: number;
  longitude: number;
  occurredAt: string;
}

// ── Alerts ────────────────────────────────────────────────────────────────────

export interface AlertSummary {
  id: string;
  type: AlertType;
  severity: Severity;
  status: AlertStatus;
  title: string;
  message: string;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  driverId: string | null;
  driverName: string | null;
  latitude: number | null;
  longitude: number | null;
  occurredAt: string;
  acknowledgedAt: string | null;
  acknowledgedBy: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  metadata: Record<string, unknown>;
}

// ── Notifications ──────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  organisationId: string;
  userId: string;
  alertId: string | null;
  type: AlertType;
  severity: Severity;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
  readAt: string | null;
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface ReportColumn {
  key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'duration';
  align?: 'left' | 'right';
}

export interface ReportResult {
  key: ReportKey;
  title: string;
  description: string;
  from: string;
  to: string;
  summary: { label: string; value: string; unit?: string }[];
  series: { label: string; points: { x: string; y: number }[] }[];
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  generatedAt: string;
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  vehicleRegistration: string;
  type: 'service' | 'repair' | 'inspection';
  description: string;
  vendor: string | null;
  odometerKm: number | null;
  cost: number | null;
  performedAt: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface ServiceSchedule {
  id: string;
  vehicleId: string;
  vehicleRegistration: string;
  name: string;
  intervalKm: number;
  intervalDays: number;
  lastServiceAt: string | null;
  lastServiceKm: number;
  nextDueAt: string | null;
  nextDueKm: number;
  status: MaintenanceStatus;
  notes: string | null;
}

// ── Devices ───────────────────────────────────────────────────────────────────

export interface DeviceSummary {
  id: string;
  deviceId: string;
  deviceType: DeviceType;
  imei: string | null;
  model: string;
  firmwareVersion: string;
  provider: string;
  status: DeviceStatus;
  lastCommunicationAt: string | null;
  vehicleId: string | null;
  vehicleRegistration: string | null;
  config: Record<string, unknown>;
  activeFlag: boolean;
  createdAt: string;
}

export interface DeviceAssignmentRecord {
  id: string;
  deviceId: string;
  deviceSerial: string;
  vehicleId: string;
  vehicleRegistration: string;
  assignedAt: string;
  unassignedAt: string | null;
}

// ── Administration ────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  roleId: string;
  roleName: RoleName;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface RoleSummary {
  id: string;
  name: RoleName;
  description: string;
  isSystem: boolean;
  permissions: Permission[];
  userCount: number;
}

export interface FleetGroup {
  id: string;
  name: string;
  description: string | null;
  color: string;
  vehicleCount: number;
  createdAt: string;
}

export interface NotificationPreference {
  id: string;
  alertType: AlertType;
  channel: NotificationChannel;
  enabled: boolean;
  minSeverity: Severity;
}

export interface ApiKeySummary {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

export interface ApiKeyCreated extends ApiKeySummary {
  /** Returned exactly once. */
  secret: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  userName: string | null;
  userEmail: string | null;
  ipAddress: string | null;
  createdAt: string;
  metadata: Record<string, unknown>;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export interface DashboardSummary {
  generatedAt: string;
  range: { from: string; to: string };
  fleet: {
    totalVehicles: number;
    moving: number;
    idle: number;
    stopped: number;
    offline: number;
    activeTrips: number;
    distanceKm: number;
    utilisationPct: number;
    avgSpeedKph: number;
    alertsToday: number;
    maintenanceDue: number;
    gpsHealthyPct: number;
  };
  charts: {
    activity: { label: string; moving: number; idle: number; stopped: number; offline: number }[];
    utilisationTrend: { date: string; pct: number }[];
    dailyDistance: { date: string; km: number }[];
    driverPerformance: { driverId: string; name: string; score: number }[];
    alertTrend: { date: string; critical: number; high: number; medium: number; low: number }[];
  };
  recentTrips: TripSummary[];
  highPriorityAlerts: AlertSummary[];
}

export interface ActivityFeedItem {
  id: string;
  kind: 'alert' | 'trip' | 'geofence' | 'device';
  title: string;
  description: string;
  severity: Severity | null;
  vehicleRegistration: string | null;
  occurredAt: string;
}

// ── Intelligence (deterministic foundation) ───────────────────────────────────

export type InsightMethod = 'deterministic' | 'statistical' | 'ml';

export interface IntelligenceInsight {
  key: string;
  category: 'maintenance' | 'safety' | 'operations' | 'anomaly' | 'route';
  title: string;
  description: string;
  method: InsightMethod;
  confidence: number | null;
  severity: Severity;
  evidence: string[];
  entityType: 'vehicle' | 'driver' | 'fleet' | null;
  entityId: string | null;
  generatedAt: string;
}

export interface IntelligenceOverview {
  generatedAt: string;
  disclaimer: string;
  insights: IntelligenceInsight[];
  providerStatus: {
    fleetCopilot: 'interface_only' | 'available';
    predictiveMaintenance: 'heuristic' | 'ml';
    driverRisk: 'heuristic' | 'ml';
    anomalyDetection: 'statistical' | 'ml';
    routeIntelligence: 'interface_only' | 'available';
  };
  modelVersion: string;
}

// ── Simulator ─────────────────────────────────────────────────────────────────

export interface SimulatorStatus {
  running: boolean;
  vehicleCount: number;
  intervalMs: number;
  seed: string;
  startedAt: string | null;
  uptimeSeconds: number;
  lastPublishAt: string | null;
  publishedEvents: number;
  failedBatches: number;
  apiConnected: boolean;
  cities: string[];
}
