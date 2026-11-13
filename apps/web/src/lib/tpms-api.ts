import { apiRequest } from './api';
import type {
  TpmsDashboard,
  TpmsVehicleConfig,
  TpmsVehicleStatus,
  TpmsSensor,
  TpmsReading,
  TpmsLifecycleRecord,
  UpsertTpmsVehicleConfigInput,
} from '@geoventra/contracts';

export async function fetchTpmsDashboard(): Promise<TpmsDashboard> {
  return apiRequest<TpmsDashboard>('/tpms/dashboard');
}

export async function fetchTpmsVehicleStatus(vehicleId: string): Promise<TpmsVehicleStatus> {
  return apiRequest<TpmsVehicleStatus>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/status`);
}

export async function fetchTpmsVehicleConfig(vehicleId: string): Promise<TpmsVehicleConfig> {
  return apiRequest<TpmsVehicleConfig>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/config`);
}

export async function saveTpmsVehicleConfig(
  vehicleId: string,
  input: UpsertTpmsVehicleConfigInput,
): Promise<TpmsVehicleConfig> {
  return apiRequest<TpmsVehicleConfig>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/config`, {
    method: 'PUT',
    body: input,
  });
}

export async function fetchTpmsSensors(vehicleId: string): Promise<{ data: TpmsSensor[] }> {
  return apiRequest<{ data: TpmsSensor[] }>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/sensors`);
}

export async function assignTpmsSensor(
  vehicleId: string,
  input: {
    sensorId: string;
    sensorSerial: string;
    sensorType?: string;
    wheelPosition: string;
    tyreSerial?: string | null;
    tyreBrand?: string | null;
    tyreModel?: string | null;
    tyreSize?: string | null;
    notes?: string | null;
  },
): Promise<TpmsSensor> {
  return apiRequest<TpmsSensor>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/sensors`, {
    method: 'POST',
    body: input,
  });
}

export async function fetchTpmsReadings(
  vehicleId: string,
  params: { wheelPosition?: string; from?: string; to?: string; limit?: number } = {},
): Promise<{ data: TpmsReading[] }> {
  return apiRequest<{ data: TpmsReading[] }>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/readings`, {
    query: {
      wheelPosition: params.wheelPosition,
      from: params.from,
      to: params.to,
      limit: params.limit,
    },
  });
}

export async function fetchTpmsLifecycle(vehicleId: string): Promise<{ data: TpmsLifecycleRecord[] }> {
  return apiRequest<{ data: TpmsLifecycleRecord[] }>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/lifecycle`);
}

export async function createTpmsLifecycle(
  vehicleId: string,
  input: {
    wheelPosition: string;
    action: string;
    sensorId?: string | null;
    tyreSerial?: string | null;
    tyreBrand?: string | null;
    tyreModel?: string | null;
    tyreSize?: string | null;
    odometerKm?: number | null;
    cost?: number | null;
    notes?: string | null;
  },
): Promise<TpmsLifecycleRecord> {
  return apiRequest<TpmsLifecycleRecord>(`/tpms/vehicles/${encodeURIComponent(vehicleId)}/lifecycle`, {
    method: 'POST',
    body: input,
  });
}

export async function fetchTpmsAlerts(params: { vehicleId?: string; status?: string; severity?: string } = {}): Promise<{ data: any[] }> {
  return apiRequest<{ data: any[] }>('/tpms/alerts', { query: params as any });
}

export async function acknowledgeTpmsAlert(id: string): Promise<any> {
  return apiRequest(`/tpms/alerts/${encodeURIComponent(id)}/acknowledge`, { method: 'POST' });
}

export async function resolveTpmsAlert(id: string): Promise<any> {
  return apiRequest(`/tpms/alerts/${encodeURIComponent(id)}/resolve`, { method: 'POST' });
}

export function tpmsReadingsExportUrl(vehicleId: string, params: { from?: string; to?: string } = {}): string {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  const qs = q.toString();
  return `/tpms/vehicles/${encodeURIComponent(vehicleId)}/readings/export.csv${qs ? `?${qs}` : ''}`;
}
