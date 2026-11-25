/** GEOVENTRA — vehicles API client.
 *  Typed functions for the fleet registry endpoints.
 */

import type {
  VehicleSummary,
  VehicleStatus,
  FuelType,
  MaintenanceStatus,
  Paginated,
  VehicleDetail,
} from '@geoventra/contracts';
import { apiRequest } from './api';

export interface VehiclesQuery {
  q?: string;
  category?: string;
  status?: VehicleStatus;
  fuelType?: FuelType;
  search?: string;
  active?: 'all' | 'active' | 'inactive';
  page?: number;
  pageSize?: number;
}

export async function fetchVehicles(query: VehiclesQuery = {}): Promise<Paginated<VehicleSummary>> {
  const activeFlag = query.active === 'active' ? true : query.active === 'inactive' ? false : undefined;
  return apiRequest<Paginated<VehicleSummary>>('/vehicles', {
    query: { page: query.page, pageSize: query.pageSize, q: query.q, category: query.category, status: query.status, search: query.search, activeFlag },
  });
}

export async function setVehicleStatus(id: string, activeFlag: boolean, reason?: string): Promise<VehicleSummary> {
  return apiRequest<VehicleSummary>(`/vehicles/${id}/status`, { method: 'PATCH', body: { active_flag: activeFlag, reason } });
}

export async function fetchVehicle(id: string): Promise<VehicleDetail> {
  return apiRequest<VehicleDetail>(`/vehicles/${id}`);
}

export async function fetchVehicleFullProfile(id: string): Promise<any> {
  return apiRequest<any>(`/vehicles/${id}/full-profile`);
}

export async function createVehicle(input: {
  registrationNumber: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  fuelType: FuelType;
  year: number;
  vin: string;
  chassisNumber?: string;
  engineNumber?: string;
  ownership?: string;
  city?: string;
  groupId?: string;
  assignedDriverId?: string;
  status?: VehicleStatus;
  odometerKm?: number;
  engineHours?: number;
  maintenanceStatus?: MaintenanceStatus;
  insuranceExpiry?: string;
  registrationExpiry?: string;
  notes?: string;
}): Promise<VehicleSummary> {
  return apiRequest<VehicleSummary>('/vehicles', { method: 'POST', body: input });
}

export async function updateVehicle(id: string, input: Partial<{
  registrationNumber: string;
  name: string;
  category: string;
  manufacturer: string;
  model: string;
  fuelType: FuelType;
  year: number;
  vin: string;
  chassisNumber?: string;
  engineNumber?: string;
  ownership?: string;
  city?: string;
  groupId?: string;
  assignedDriverId?: string;
  status?: VehicleStatus;
  odometerKm?: number;
  engineHours?: number;
  maintenanceStatus?: MaintenanceStatus;
  insuranceExpiry?: string;
  registrationExpiry?: string;
  notes?: string;
  activeFlag?: boolean;
}>): Promise<VehicleSummary> {
  return apiRequest<VehicleSummary>(`/vehicles/${id}`, { method: 'PATCH', body: input });
}

export async function deleteVehicle(id: string): Promise<void> {
  return apiRequest<void>(`/vehicles/${id}`, { method: 'DELETE' });
}

export async function assignDriverToVehicle(vehicleId: string, driverId: string): Promise<VehicleSummary> {
  return apiRequest<VehicleSummary>(`/vehicles/${vehicleId}/assign-driver`, { method: 'POST', body: { driverId } });
}


export async function updateVehicleGpsFreshness(id: string, minutes: number | null): Promise<number | null> {
  return apiRequest<number | null>(`/vehicles/${encodeURIComponent(id)}/gps-freshness`, { method: 'PUT', body: { minutes } });
}
