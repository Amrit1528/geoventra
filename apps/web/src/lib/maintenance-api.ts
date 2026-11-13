import { apiRequest } from './api';
export function fetchMaintenance(query: any = {}) { return apiRequest<any>('/maintenance', { query }); }
export function fetchMaintenanceSummary() { return apiRequest<any>('/maintenance/summary'); }
export function createMaintenance(body: any) { return apiRequest<any>('/maintenance', { method: 'POST', body }); }
export function updateMaintenance(id: string, body: any) { return apiRequest<any>(`/maintenance/${id}`, { method: 'PATCH', body }); }
