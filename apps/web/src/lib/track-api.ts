/**
 * GEOVENTRA — tracking/trips/geofences API client.
 *
 * Typed functions for the Phase P0 endpoints: live snapshot, trip history and geofence
 * management. Follows the same pattern as `engine-api.ts`.
 */

import type {
  GeofenceDetail,
  GeofenceEvent,
  GeofenceUpsert,
  TripPlayback,
  TripSummary,
} from '@geoventra/contracts';
import { apiRequest, type QueryParams } from './api';

// ── Live snapshot ────────────────────────────────────────────────────────────

export type { LivePosition } from '@geoventra/contracts';

export interface TrackingSnapshotResponse {
  positions: import('@geoventra/contracts').LivePosition[];
  geofences: import('@geoventra/contracts').GeofenceSummary[];
  serverTime: string;
}

export function fetchSnapshot(signal?: AbortSignal): Promise<TrackingSnapshotResponse> {
  return apiRequest<TrackingSnapshotResponse>('/tracking/snapshot', { signal });
}

export function fetchTrail(vehicleId: string, limit = 500, signal?: AbortSignal) {
  return apiRequest<{ data: import('@geoventra/contracts').TrackPoint[] }>(
    `/tracking/vehicles/${encodeURIComponent(vehicleId)}/trail`,
    { query: { limit }, signal },
  );
}

// ── Trips ────────────────────────────────────────────────────────────────────

export interface TripsQuery {
  vehicleId?: string;
  status?: 'active' | 'completed' | 'cancelled';
  from?: string;
  to?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export function buildTripsQuery(query: TripsQuery = {}): QueryParams {
  return {
    vehicleId: query.vehicleId,
    status: query.status,
    from: query.from,
    to: query.to,
    search: query.search,
    page: query.page,
    pageSize: query.pageSize,
  };
}

export function fetchTrips(
  query: TripsQuery = {},
  signal?: AbortSignal,
): Promise<{ data: TripSummary[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  return apiRequest('/trips', { query: buildTripsQuery(query), signal });
}

export function fetchTrip(tripId: string, signal?: AbortSignal): Promise<TripSummary> {
  return apiRequest<TripSummary>(`/trips/${encodeURIComponent(tripId)}`, { signal });
}

export function fetchTripPlayback(tripId: string, signal?: AbortSignal): Promise<TripPlayback> {
  return apiRequest<TripPlayback>(`/trips/${encodeURIComponent(tripId)}/playback`, { signal });
}

// ── Geofences ────────────────────────────────────────────────────────────────

export function fetchGeofences(signal?: AbortSignal): Promise<{ data: GeofenceDetail[] }> {
  return apiRequest<{ data: GeofenceDetail[] }>('/geofences', { signal });
}

export function fetchGeofence(geofenceId: string, signal?: AbortSignal): Promise<GeofenceDetail> {
  return apiRequest<GeofenceDetail>(`/geofences/${encodeURIComponent(geofenceId)}`, { signal });
}

export function createGeofence(input: GeofenceUpsert): Promise<GeofenceDetail> {
  return apiRequest<GeofenceDetail>('/geofences', { method: 'POST', body: input });
}

export function updateGeofence(geofenceId: string, input: Partial<GeofenceUpsert>): Promise<GeofenceDetail> {
  return apiRequest<GeofenceDetail>(`/geofences/${encodeURIComponent(geofenceId)}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deleteGeofence(geofenceId: string): Promise<void> {
  return apiRequest<void>(`/geofences/${encodeURIComponent(geofenceId)}`, { method: 'DELETE' });
}

export function setGeofenceVehicles(geofenceId: string, vehicleIds: string[]): Promise<GeofenceDetail> {
  return apiRequest<GeofenceDetail>(`/geofences/${encodeURIComponent(geofenceId)}/vehicles`, {
    method: 'PUT',
    body: { vehicleIds },
  });
}

export interface GeofenceEventsQuery {
  geofenceId?: string;
  vehicleId?: string;
  eventType?: 'entry' | 'exit';
  limit?: number;
}

export function fetchGeofenceEvents(
  query: GeofenceEventsQuery = {},
  signal?: AbortSignal,
): Promise<{ data: GeofenceEvent[] }> {
  return apiRequest<{ data: GeofenceEvent[] }>('/geofences/events', {
    query: {
      geofenceId: query.geofenceId,
      vehicleId: query.vehicleId,
      eventType: query.eventType,
      limit: query.limit,
    },
    signal,
  });
}
