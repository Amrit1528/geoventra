import { apiRequest } from './api';

export function fetchOpenIdles() {
  return apiRequest<any[]>('/idle/open');
}

export function fetchCurrentIdle(vehicleId: string) {
  return apiRequest<any>(`/idle/vehicles/${encodeURIComponent(vehicleId)}/current`);
}

export function fetchIdleEvents(vehicleId: string, from?: string, to?: string) {
  return apiRequest<any[]>(`/idle/vehicles/${encodeURIComponent(vehicleId)}/events`, { query: { from, to } as any });
}

export function fetchIdleSummary(from?: string, to?: string) {
  return apiRequest<any[]>('/idle/summary', { query: { from, to } as any });
}