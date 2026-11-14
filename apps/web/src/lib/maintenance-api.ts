import { apiRequest } from './api';
export function fetchMaintenance(query: any = {}) { return apiRequest<any>('/maintenance', { query }); }
export function fetchMaintenanceSummary() { return apiRequest<any>('/maintenance/summary'); }
export function createMaintenance(body: any) { return apiRequest<any>('/maintenance', { method: 'POST', body }); }
export function updateMaintenance(id: string, body: any) { return apiRequest<any>(`/maintenance/${id}`, { method: 'PATCH', body }); }

export function fetchServiceSchedules() { return apiRequest<any>('/maintenance/schedules'); }
export function createServiceSchedule(body: any) { return apiRequest<any>('/maintenance/schedules', { method: 'POST', body }); }
export function fetchMaintenancePredictions() { return apiRequest<any>('/maintenance/predictions'); }
export function fetchWorkOrders() { return apiRequest<any>('/maintenance/work-orders'); }
export function createWorkOrder(body: any) { return apiRequest<any>('/maintenance/work-orders', { method: 'POST', body }); }
export function fetchMaintenanceHealthScores() { return apiRequest<any>('/maintenance/health-scores'); }
export function fetchMaintenanceDowntime() { return apiRequest<any>('/maintenance/downtime'); }
