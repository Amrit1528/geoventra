/**
 * GEOVENTRA — tracking/trips/geofences API client.
 *
 * Typed functions for the Phase P0 endpoints: live snapshot, trip history and geofence
 * management. Follows the same pattern as `engine-api.ts`.
 */

import type {
  AlertSummary,
  GeofenceDetail,
  GeofenceEvent,
  GeofenceUpsert,
  Notification,
  NotificationPreference,
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

export interface GeofencesQuery {
  q?: string;
}

export function fetchGeofences(query: GeofencesQuery = {}, signal?: AbortSignal): Promise<{ data: GeofenceDetail[] }> {
  const search = query.q?.trim();
  return apiRequest<{ data: GeofenceDetail[] }>(
    `/geofences${search ? `?q=${encodeURIComponent(search)}` : ''}`,
    { signal },
  );
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

export interface GeofenceAlertsQuery {
  type?: string;
  severity?: string;
  status?: string;
  vehicleId?: string;
  limit?: number;
}

/** List the alerts raised by the geofence engine. */
export function fetchGeofenceAlerts(
  query: GeofenceAlertsQuery = {},
  signal?: AbortSignal,
): Promise<{ data: AlertSummary[] }> {
  return apiRequest<{ data: AlertSummary[] }>('/geofences/alerts', {
    query: {
      type: query.type,
      severity: query.severity,
      status: query.status,
      vehicleId: query.vehicleId,
      limit: query.limit,
    },
    signal,
  });
}

/** Acknowledge a geofence alert. */
export function acknowledgeGeofenceAlert(alertId: string): Promise<AlertSummary> {
  return apiRequest<AlertSummary>(`/geofences/alerts/${encodeURIComponent(alertId)}/acknowledge`, {
    method: 'POST',
    body: {},
  });
}

/** Resolve a geofence alert. */
export function resolveGeofenceAlert(alertId: string): Promise<AlertSummary> {
  return apiRequest<AlertSummary>(`/geofences/alerts/${encodeURIComponent(alertId)}/resolve`, {
    method: 'POST',
    body: {},
  });
}

/** Assign a fleet (vehicle group) to a geofence. */
export function setGeofenceFleet(geofenceId: string, fleetId: string): Promise<GeofenceDetail> {
  return apiRequest<GeofenceDetail>(`/geofences/${encodeURIComponent(geofenceId)}/fleets`, {
    method: 'PUT',
    body: { fleetId },
  });
}

// ── Notifications ────────────────────────────────────────────────────────────

export interface NotificationsQuery {
  read?: boolean;
  severity?: string;
  limit?: number;
  page?: number;
  pageSize?: number;
}

export function buildNotificationsQuery(query: NotificationsQuery = {}): QueryParams {
  return {
    read: query.read,
    severity: query.severity,
    limit: query.limit,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** List the current user's in-app notifications (unread first). */
export function fetchNotifications(
  query: NotificationsQuery = {},
  signal?: AbortSignal,
): Promise<{ data: Notification[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }> {
  return apiRequest<{ data: Notification[]; meta: { page: number; pageSize: number; total: number; totalPages: number } }>(
    '/notifications',
    { query: buildNotificationsQuery(query), signal },
  );
}

/** Unread notification counter for the badge. */
export function fetchUnreadNotificationCount(signal?: AbortSignal): Promise<{ count: number }> {
  return apiRequest<{ count: number }>('/notifications/unread-count', { signal });
}

/** Mark a single notification as read. */
export function markNotificationRead(notificationId: string): Promise<Notification> {
  return apiRequest<Notification>(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'POST',
    body: {},
  });
}

/** Mark every notification of the user as read. */
export function markAllNotificationsRead(): Promise<{ count: number }> {
  return apiRequest<{ count: number }>('/notifications/read-all', { method: 'POST', body: {} });
}

/** Per-user notification channel preferences. */
export function fetchNotificationPreferences(signal?: AbortSignal): Promise<NotificationPreference[]> {
  return apiRequest<NotificationPreference[]>('/notifications/preferences', { signal });
}

/** Upsert a notification channel preference. */
export function updateNotificationPreferences(preferences: NotificationPreference[]): Promise<NotificationPreference[]> {
  return apiRequest<NotificationPreference[]>('/notifications/preferences', {
    method: 'PUT',
    body: preferences,
  });
}


export function fetchGpsFreshness(_?: any): Promise<{ minutes: number; defaultMinutes: number }> {
  return apiRequest<{ minutes: number; defaultMinutes: number }>('/tracking/settings/gps-freshness');
}

export function updateGpsFreshness(minutes: number): Promise<{ minutes: number }> {
  return apiRequest<{ minutes: number }>('/tracking/settings/gps-freshness', { method: 'PUT', body: { minutes } });
}
