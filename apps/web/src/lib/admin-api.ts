import { apiRequest } from './api';

export function fetchAdminUsers(query: any = {}) { return apiRequest<any>('/admin/users', { query }); }
export function createAdminUser(body: any) { return apiRequest<any>('/admin/users', { method: 'POST', body }); }
export function updateAdminUser(id: string, body: any) { return apiRequest<any>(`/admin/users/${id}`, { method: 'PATCH', body }); }
export function deleteAdminUser(id: string) { return apiRequest<any>(`/admin/users/${id}`, { method: 'PATCH', body: { delete: true } }); }
export function fetchRoles() { return apiRequest<any>('/admin/roles'); }
export function fetchAuditLogs(query: any = {}) { return apiRequest<any>('/admin/audit-logs', { query }); }
export function fetchApiKeys(query: any = {}) { return apiRequest<any>('/admin/api-keys', { query }); }
export function createApiKey(body: any) { return apiRequest<any>('/admin/api-keys', { method: 'POST', body }); }
export function fetchFleetGroups() { return apiRequest<any>('/admin/fleet-groups'); }
