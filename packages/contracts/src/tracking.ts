/**
 * GEOVENTRA — tracking, trips and geofence realtime contracts.
 *
 * These types sit on top of the historical `domain.ts` vocabulary (LivePosition, TripSummary,
 * GeofenceSummary …) and define the realtime channel plus the shapes used by the new Phase
 * P0 surfaces: live fleet map, trips and geofences.
 */

import type {
  AlertSummary,
  DeviceStatus,
  GeofenceSummary,
  LivePosition,
  PaginationMeta,
  TripSummary,
  VehicleCategory,
  VehicleStatus,
} from './domain.js';

// ── Realtime events (socket.io) ──────────────────────────────────────────────

export const TRACKING_REALTIME_EVENTS = ['tracking.positions'] as const;
export type TrackingRealtimeEventName = (typeof TRACKING_REALTIME_EVENTS)[number];

/** Room a client joins to receive live position batches for one organisation. */
export const trackingOrgRoom = (organisationId: string): string => `tracking-org:${organisationId}`;

export interface TrackingPositionsEvent {
  type: 'tracking.positions';
  /** Only the vehicles whose position changed since the last batch. */
  positions: LivePosition[];
  emittedAt: string;
}

export type TrackingRealtimeEvent = TrackingPositionsEvent;

/** Client → server messages used to subscribe to an organisation's position stream. */
export const TRACKING_SUBSCRIBE_MESSAGE = 'tracking:subscribe';
export const TRACKING_UNSUBSCRIBE_MESSAGE = 'tracking:unsubscribe';

// ── Vehicle detail (Phase P0.2) ──────────────────────────────────────────────

/**
 * Full tracking detail for a single vehicle: static vehicle identity, the freshest
 * live position, the bound device and driver, and the latest open alerts.
 *
 * Every field that no device has reported yet is `null` so the UI can render
 * unavailable telemetry explicitly instead of guessing.
 */
export interface VehicleTrackingDetail {
  vehicleId: string;
  registrationNumber: string;
  name: string;
  category: VehicleCategory;
  status: VehicleStatus;
  latitude: number | null;
  longitude: number | null;
  speedKph: number | null;
  heading: number | null;
  ignition: boolean | null;
  accuracyM: number | null;
  batteryVoltage: number | null;
  odometerKm: number | null;
  driverId: string | null;
  driverName: string | null;
  deviceId: string | null;
  deviceStatus: DeviceStatus | null;
  lastRecordedAt: string | null;
  lastReceivedAt: string | null;
  lastCommunicationAt: string | null;
  /** Age of the freshest sample in seconds; `null` when the vehicle never reported. */
  ageSeconds: number | null;
  openAlertCount: number;
  alerts: AlertSummary[];
  serverTime: string;
}

// ── Vehicle tracking history (Phase P0.2) ────────────────────────────────────

/**
 * One canonical historical GPS sample. Units match the ingest contract:
 * speed in km/h, odometer in km, battery in volts, accuracy in metres, heading in degrees.
 */
export interface VehicleHistoryPoint {
  vehicleId: string;
  latitude: number;
  longitude: number;
  speedKph: number;
  heading: number;
  ignition: boolean;
  recordedAt: string;
  /** When the frame was persisted by the platform (vs. the device's own clock). */
  receivedAt: string;
  accuracyM: number | null;
  batteryVoltage: number | null;
  odometerKm: number | null;
  gpsSignal: string | null;
  satelliteCount: number | null;
  engineHours: number | null;
  locationName: string | null;
  source: string;
}

/** Paginated envelope for vehicle history reads. */
export interface VehicleHistoryPage {
  data: VehicleHistoryPoint[];
  meta: PaginationMeta;
}

/** A temporal gap in the recorded series (device went silent for longer than the threshold). */
export interface VehicleGpsGap {
  /** ISO timestamp of the first sample after the gap. */
  from: string;
  /** ISO timestamp of the last sample before the gap. */
  to: string;
  gapSeconds: number;
}

/**
 * Calculated tracking statistics for a vehicle inside a window. `distanceSource` records
 * whether the distance figure came from the device-reported odometer or from geometry.
 */
export interface VehicleTrackingStats {
  vehicleId: string;
  from: string;
  to: string;
  firstRecordedAt: string | null;
  lastRecordedAt: string | null;
  firstLatitude: number | null;
  firstLongitude: number | null;
  lastLatitude: number | null;
  lastLongitude: number | null;
  totalDistanceKm: number;
  /** `odometer` = device-reported delta, `calculated` = geometric estimate. */
  distanceSource: 'odometer' | 'calculated';
  avgSpeedKph: number;
  maxSpeedKph: number;
  movingSeconds: number;
  idleSeconds: number;
  stoppedSeconds: number;
  gpsDataGaps: VehicleGpsGap[];
}

// ── Trips ────────────────────────────────────────────────────────────────────

export interface TripPlaybackSegment {
  latitude: number;
  longitude: number;
  speedKph: number;
  heading: number;
  ignition: boolean;
  recordedAt: string;
}

export interface TripPlayback {
  trip: TripSummary;
  points: TripPlaybackSegment[];
  events: {
    id: string;
    type: string;
    severity: string | null;
    speedKph: number | null;
    occurredAt: string;
    latitude: number | null;
    longitude: number | null;
  }[];
  stops: {
    latitude: number;
    longitude: number;
    durationSeconds: number;
    startedAt: string;
    label: string;
  }[];
  generatedAt: string;
}

// ── Geofences ────────────────────────────────────────────────────────────────

export type GeofenceScope = 'all' | 'selected';

export interface GeofenceDetail extends GeofenceSummary {
  /** Vehicles the geofence applies to (empty when scope is 'all'). */
  vehicleIds: string[];
}

export interface GeofenceUpsert {
  name: string;
  description?: string | null;
  type: 'circle' | 'polygon';
  /** WGS84 centroid (circle). */
  centerLatitude?: number;
  centerLongitude?: number;
  /** Required for circle geofences, in metres. */
  radiusM?: number;
  /** GeoJSON Polygon for polygon geofences. */
  geometry?: { type: 'Polygon'; coordinates: number[][][] } | null;
  color?: string;
  alertOnEntry?: boolean;
  alertOnExit?: boolean;
  isActive?: boolean;
  /** Selected vehicle ids; empty = all vehicles in the organisation. */
  vehicleIds?: string[];
}
