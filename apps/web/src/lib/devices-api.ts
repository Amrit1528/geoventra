import type { Paginated } from '@geoventra/contracts';
import { apiRequest } from './api';

export interface DeviceRecord {
  id: string;
  deviceId: string;
  deviceType: string;
  imei: string | null;
  model: string;
  firmwareVersion: string;
  provider: string;
  status: 'online' | 'offline' | 'degraded' | 'unassigned';
  activeFlag?: boolean;
  lastCommunicationAt: string | null;
  serialNumber?: string | null;
  macAddress?: string | null;
  installationDate?: string | null;
  installedAtLocation?: string | null;
  warrantyExpiresAt?: string | null;
  integrationMethod?: string;
}

export interface DevicesQuery {
  search?: string;
  status?: string;
  deviceType?: string;
  active?: 'all' | 'active' | 'inactive';
  page?: number;
  pageSize?: number;
}

export function fetchDevices(query: DevicesQuery = {}) {
  const activeFlag = query.active === 'active' ? true : query.active === 'inactive' ? false : undefined;
  return apiRequest<Paginated<DeviceRecord>>('/devices', { query: { ...query, activeFlag } as any });
}

export function setDeviceStatus(id: string, activeFlag: boolean, reason?: string) {
  return apiRequest<DeviceRecord>(`/devices/${encodeURIComponent(id)}/status`, { method: 'PATCH', body: { active_flag: activeFlag, reason } });
}

export function fetchDevice(id: string) {
  return apiRequest<DeviceRecord>(`/devices/${encodeURIComponent(id)}`);
}

export function createDevice(body: Record<string, unknown>) {
  return apiRequest<DeviceRecord>('/devices', { method: 'POST', body });
}

export function updateDevice(id: string, body: Record<string, unknown>) {
  return apiRequest<DeviceRecord>(`/devices/${encodeURIComponent(id)}`, { method: 'PATCH', body });
}

export function deleteDevice(id: string) {
  return apiRequest<void>(`/devices/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function assignDevice(id: string, body: { vehicleId: string; reason?: string }) {
  return apiRequest(`/devices/${encodeURIComponent(id)}/assign`, { method: 'POST', body });
}

export function unassignDevice(id: string, body: { reason?: string } = {}) {
  return apiRequest(`/devices/${encodeURIComponent(id)}/unassign`, { method: 'POST', body });
}
