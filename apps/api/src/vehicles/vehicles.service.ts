import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { VehicleSummary, Paginated, VehicleDetail } from '@geoventra/contracts';

function toNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapSummary(row: any): VehicleSummary {
  return {
    id: row.id,
    registrationNumber: row.registration_number ?? row.registrationNumber ?? '',
    name: row.name ?? '',
    category: row.category ?? 'car',
    manufacturer: row.manufacturer ?? '',
    model: row.model ?? '',
    fuelType: row.fuel_type ?? row.fuelType ?? 'diesel',
    year: toNum(row.year),
    status: row.status ?? 'offline',
    odometerKm: toNum(row.odometer_km ?? row.odometerKm),
    engineHours: toNum(row.engine_hours ?? row.engineHours),
    maintenanceStatus: row.maintenance_status ?? row.maintenanceStatus ?? 'ok',
    groupId: row.group_id ?? row.groupId ?? null,
    groupName: row.group_name ?? row.groupName ?? null,
    city: row.city ?? null,
    assignedDriverId: row.assigned_driver_id ?? row.assignedDriverId ?? null,
    assignedDriverName: row.assigned_driver_name ?? row.assignedDriverName ?? null,
    deviceId: row.device_id ?? row.deviceId ?? null,
    deviceSerial: row.device_serial ?? row.deviceSerial ?? null,
    deviceStatus: row.device_status ?? row.deviceStatus ?? null,
    lastLatitude: row.last_latitude != null ? Number(row.last_latitude) : null,
    lastLongitude: row.last_longitude != null ? Number(row.last_longitude) : null,
    lastSpeedKph: row.last_speed_kph != null ? Number(row.last_speed_kph) : null,
    lastHeading: row.last_heading != null ? Number(row.last_heading) : null,
    lastIgnition: row.last_ignition ?? null,
    lastBatteryVoltage: row.last_battery_voltage != null ? Number(row.last_battery_voltage) : null,
    lastRecordedAt: row.last_recorded_at ?? row.lastRecordedAt ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  };
}

@Injectable()
export class VehiclesService {
  constructor(private readonly database: DatabaseService) {}

  async list(organisationId: string, query: { q?: string; search?: string; category?: string; status?: string; page?: number; pageSize?: number }): Promise<Paginated<VehicleSummary>> {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 25)));
    const where = ['v.organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;
    if (query.status) { where.push(`v.status = $${i++}`); params.push(query.status); }
    if (query.category) { where.push(`v.category = $${i++}`); params.push(query.category); }
    const search = (query.search ?? query.q ?? '').trim();
    if (search) { where.push(`(v.registration_number ILIKE $${i} OR v.name ILIKE $${i} OR v.vin ILIKE $${i})`); params.push(`%${search}%`); i++; }

    const countRows = await this.database.query(`SELECT COUNT(*)::int AS total FROM geoventra.vehicles v WHERE ${where.join(' AND ')}`, params);
    const total = Number((countRows[0] as any)?.total ?? 0);
    const rows = await this.database.query(
      `SELECT v.id, v.registration_number, v.name, v.category, v.manufacturer, v.model, v.fuel_type, v.year, v.status,
              v.odometer_km, v.engine_hours, v.maintenance_status, v.group_id, v.city, v.assigned_driver_id,
              v.vin, v.insurance_expiry, v.registration_expiry, v.notes, v.created_at,
              g.name AS group_name, d.name AS assigned_driver_name
       FROM geoventra.vehicles v
       LEFT JOIN geoventra.vehicle_groups g ON g.id = v.group_id
       LEFT JOIN geoventra.drivers d ON d.id = v.assigned_driver_id
       WHERE ${where.join(' AND ')}
       ORDER BY v.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, pageSize, (page - 1) * pageSize],
    );
    return { data: rows.map(mapSummary), meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
  }

  async getById(organisationId: string, id: string): Promise<VehicleDetail> {
    const row = await this.database.queryOne<any>(
      `SELECT v.*, g.name AS group_name, d.name AS assigned_driver_name
       FROM geoventra.vehicles v
       LEFT JOIN geoventra.vehicle_groups g ON g.id = v.group_id
       LEFT JOIN geoventra.drivers d ON d.id = v.assigned_driver_id
       WHERE v.organisation_id = $1 AND v.id = $2`,
      [organisationId, id],
    );
    if (!row) throw new NotFoundException('Vehicle not found');
    const base = mapSummary(row);
    return {
      ...base,
      vin: row.vin ?? '',
      insuranceExpiry: row.insurance_expiry ?? null,
      registrationExpiry: row.registration_expiry ?? null,
      notes: row.notes ?? null,
      health: {
        deviceConnectivity: base.deviceStatus === 'online' ? 'online' : base.deviceStatus === 'degraded' ? 'degraded' : 'offline',
        batteryVoltage: base.lastBatteryVoltage,
        batteryStatus: base.lastBatteryVoltage == null ? 'unknown' : base.lastBatteryVoltage < 11.5 ? 'critical' : base.lastBatteryVoltage < 12.0 ? 'low' : 'good',
        serviceStatus: base.maintenanceStatus,
        lastServiceAt: null,
        nextServiceDueKm: null,
        nextServiceDueAt: null,
        openAlertCount: 0,
        note: 'Vehicle health derived from available telemetry and service records.',
      },
      driver: row.assigned_driver_id ? { id: row.assigned_driver_id, name: row.assigned_driver_name ?? 'Driver', phone: '', email: '', licenseNumber: '', licenseExpiry: '', status: 'active', safetyScore: 0, assignedVehicleId: row.id, assignedVehicleRegistration: base.registrationNumber, trips30d: 0, distance30dKm: 0, harshBraking30d: 0, harshAcceleration30d: 0, speeding30d: 0, createdAt: base.createdAt } as any : null,
      device: base.deviceId ? { id: base.deviceId, serialNumber: base.deviceSerial ?? '', model: '', manufacturer: '', status: (base.deviceStatus ?? 'offline') as any, vehicleId: base.id, lastSeenAt: base.lastRecordedAt, firmwareVersion: null, protocol: null, simNumber: null, simProvider: null, installedAt: null } as any : null,
    };
  }

  async create(organisationId: string, input: any): Promise<VehicleSummary> {
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.vehicles (organisation_id, registration_number, name, category, manufacturer, model, fuel_type, year, vin, city, group_id, assigned_driver_id, status, odometer_km, engine_hours, maintenance_status, insurance_expiry, registration_expiry, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [organisationId, input.registrationNumber, input.name, input.category ?? 'car', input.manufacturer, input.model, input.fuelType ?? 'diesel', input.year ?? new Date().getFullYear(), input.vin ?? '', input.city ?? null, input.groupId ?? null, input.assignedDriverId ?? null, input.status ?? 'offline', input.odometerKm ?? 0, input.engineHours ?? 0, input.maintenanceStatus ?? 'ok', input.insuranceExpiry ?? null, input.registrationExpiry ?? null, input.notes ?? null],
    );
    return mapSummary(row);
  }

  async update(organisationId: string, id: string, input: any): Promise<VehicleSummary> {
    const existing = await this.database.queryOne<any>('SELECT id FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2', [organisationId, id]);
    if (!existing) throw new NotFoundException('Vehicle not found');
    const fields: string[] = ['updated_at = now()'];
    const params: any[] = [];
    let i = 1;
    const map: Record<string, string> = { registrationNumber: 'registration_number', fuelType: 'fuel_type', groupId: 'group_id', assignedDriverId: 'assigned_driver_id', odometerKm: 'odometer_km', engineHours: 'engine_hours', maintenanceStatus: 'maintenance_status', insuranceExpiry: 'insurance_expiry', registrationExpiry: 'registration_expiry' };
    for (const [k, v] of Object.entries(input ?? {})) {
      if (v === undefined) continue;
      const col = map[k] ?? k;
      fields.push(`${col} = $${i++}`);
      params.push(v);
    }
    params.push(organisationId, id);
    const row = await this.database.queryOne<any>(`UPDATE geoventra.vehicles SET ${fields.join(', ')} WHERE organisation_id = $${i} AND id = $${i + 1} RETURNING *`, params);
    return mapSummary(row);
  }

  async remove(organisationId: string, id: string): Promise<void> {
    await this.database.query('DELETE FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2', [organisationId, id]);
  }

  async assignDriver(organisationId: string, vehicleId: string, driverId: string): Promise<VehicleSummary> {
    const row = await this.database.queryOne<any>('UPDATE geoventra.vehicles SET assigned_driver_id = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING *', [organisationId, vehicleId, driverId]);
    if (!row) throw new NotFoundException('Vehicle not found');
    return mapSummary(row);
  }
}
