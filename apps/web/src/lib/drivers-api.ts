import type { Paginated } from '@geoventra/contracts';
import { apiRequest } from './api';

export interface DriversQuery {
  search?: string;
  status?: string;
  active?: 'all' | 'active' | 'inactive';
  page?: number;
  pageSize?: number;
}

export function fetchDrivers(query: DriversQuery = {}) {
  const activeFlag = query.active === 'active' ? true : query.active === 'inactive' ? false : undefined;
  return apiRequest<Paginated<any>>('/drivers', { query: { ...query, activeFlag } });
}
export function createDriver(body: any) { return apiRequest<any>('/drivers', { method: 'POST', body }); }
export function updateDriver(id: string, body: any) { return apiRequest<any>(`/drivers/${id}`, { method: 'PATCH', body }); }
export function setDriverStatus(id: string, activeFlag: boolean, reason?: string) { return apiRequest<any>(`/drivers/${id}/status`, { method: 'PATCH', body: { active_flag: activeFlag, reason } }); }
export function deleteDriver(id: string) { return apiRequest<any>(`/drivers/${id}`, { method: 'DELETE' }); }