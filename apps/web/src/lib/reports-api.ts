import { apiRequest } from './api';

export type ReportQuery = { from?: string; to?: string };

export function fetchFleetSummary(query: ReportQuery = {}) { return apiRequest<any>('/reports/fleet-summary', { query }); }
export function fetchTripsReport(query: ReportQuery = {}) { return apiRequest<any>('/reports/trips', { query }); }
export function fetchUtilizationReport(query: ReportQuery = {}) { return apiRequest<any>('/reports/utilization', { query }); }
export function fetchFuelReport(query: ReportQuery = {}) { return apiRequest<any>('/reports/fuel', { query }); }
export function fetchGeofenceReport(query: ReportQuery = {}) { return apiRequest<any>('/reports/geofence', { query }); }
export function fetchDeviceHealthReport() { return apiRequest<any>('/reports/devices'); }
export function fetchMaintenanceReport(query: ReportQuery = {}) { return apiRequest<any>('/reports/maintenance', { query }); }

export function reportExportUrl(key: string, query: ReportQuery = {}): string {
  const params = new URLSearchParams();
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1').replace(/\/$/, '');
  const qs = params.toString();
  return `${base}/reports/${encodeURIComponent(key)}/export.csv${qs ? `?${qs}` : ''}`;
}
