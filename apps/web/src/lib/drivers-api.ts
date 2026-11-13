import type { Paginated } from '@geoventra/contracts';
import { apiRequest } from './api';

export function fetchDrivers(query: any = {}) { return apiRequest<Paginated<any>>('/drivers', { query }); }
export function createDriver(body: any) { return apiRequest<any>('/drivers', { method: 'POST', body }); }
export function updateDriver(id: string, body: any) { return apiRequest<any>(`/drivers/${id}`, { method: 'PATCH', body }); }
export function deleteDriver(id: string) { return apiRequest<any>(`/drivers/${id}`, { method: 'DELETE' }); }
