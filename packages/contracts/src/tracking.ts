/**
 * GEOVENTRA — tracking, trips and geofence realtime contracts.
 *
 * These types sit on top of the historical `domain.ts` vocabulary (LivePosition, TripSummary,
 * GeofenceSummary …) and define the realtime channel plus the shapes used by the new Phase
 * P0 surfaces: live fleet map, trips and geofences.
 */

import type { GeofenceSummary, LivePosition, TripSummary } from './domain.js';

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
