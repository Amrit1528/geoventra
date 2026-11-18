import { apiRequest } from './api';

export function fetchFuelSummary() {
  return apiRequest<any>('/fuel/summary');
}
export function fetchFuelLatest(vehicleId: string) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/latest`);
}
export function fetchFuelSeries(vehicleId: string, params: { from?: string; to?: string } = {}) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/series`, { query: params });
}
export function fetchFuelReadings(vehicleId: string, params: Record<string, string | number | undefined> = {}) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/readings`, { query: params });
}
export function fetchFuelConsumption(vehicleId: string, params: { from?: string; to?: string } = {}) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/consumption`, { query: params });
}
export function fetchRefuellingEvents(vehicleId: string, params: { from?: string; to?: string } = {}) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/refuelling`, { query: params });
}
export function fetchFuelAnomalies(vehicleId: string, params: { from?: string; to?: string } = {}) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/anomalies`, { query: params });
}
export function fetchFuelDrain(vehicleId: string, params: { from?: string; to?: string } = {}) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/drain`, { query: params });
}
export function createRefuellingEvent(vehicleId: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/refuelling`, { method: 'POST', body });
}
export function createFuelReading(vehicleId: string, body: Record<string, unknown>) {
  return apiRequest<any>(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/readings`, { method: 'POST', body });
}
export function createFuelSensor(vehicleId: string, body: Record<string, unknown>) {
  return apiRequest(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/sensors`, { method: 'POST', body });
}
export function fetchFuelExpenses(vehicleId: string, params: { from?: string; to?: string } = {}): Promise<{ data: any[]; total: number }> {
  return apiRequest(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/expenses`, { query: params });
}
export function createFuelExpense(vehicleId: string, body: { amount: number; description?: string; approved?: boolean }) {
  return apiRequest(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/expenses`, { method: 'POST', body });
}
export function acknowledgeFuelAnomaly(vehicleId: string, anomalyId: string) {
  return apiRequest(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/anomalies/${encodeURIComponent(anomalyId)}/acknowledge`, { method: 'POST', body: {} });
}
export function confirmFuelAnomaly(vehicleId: string, anomalyId: string) {
  return apiRequest(`/fuel/vehicles/${encodeURIComponent(vehicleId)}/anomalies/${encodeURIComponent(anomalyId)}/confirm`, { method: 'POST', body: {} });
}
