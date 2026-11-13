/** GEOVENTRA — vehicles service.
 *  Business logic for the fleet registry: list, create, update, delete, assign.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import type { VehicleSummary, Paginated, VehicleStatus, VehicleFuelType, VehicleMaintenanceStatus } from '@geoventra/contracts';

const VALID_STATUSES = ['moving', 'idle', 'stopped', 'offline'] as VehicleStatus[];
const VALID_FUEL_TYPES = ['petrol', 'diesel', 'cng', 'electric', 'hybrid'] as VehicleFuelType[];
const VALID_MAINTENANCE_STATUSES = ['ok', 'due_soon', 'overdue', 'in_service'] as VehicleMaintenanceStatus[];

@Injectable()
export class VehiclesService {
  constructor(private readonly database: DatabaseService) {}

  async listVehicles(organisationId: string, query: { q?: string; category?: string; status?: VehicleStatus; fuelType?: VehicleFuelType; search?: string; page: number; pageSize: number }): Promise<Paginated<VehicleSummary>> {
    const { q, category, status, fuelType, search, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1', '1 = 1'];
    const params: any[] = [organisationId];
    let paramIndex = 2;

    if (status) { where.push(`status = $${paramIndex}`); params.push(status); paramIndex++; }
    if (fuelType) { where.push(`fuel_type = $${paramIndex}`); params.push(fuelType); paramIndex++; }
    if (category) { where.push(`category = $${paramIndex}`); params.push(category); paramIndex++; }
    if (search) {
      where.push(`(registration_number ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`);
      params.push(`%${search}%`); paramIndex++;
    }
    if (q) {
      where.push(`(registration_number ILIKE $${paramIndex} OR name ILIKE $${paramIndex})`);
      params.push(`%${q}%`); paramIndex++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.vehicles WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult[0].total;

    const dataSql = `SELECT id, registration_number, name, category, manufacturer, model, fuel_type, year, vin, city, group_id, assigned_driver_id, status, odometer_km, engine_hours, maintenance_status, insurance_expiry, registration_expiry, notes, created_at, updated_at FROM geoventra.vehicles WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const rows = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getVehicle(organisationId: string, id: string): Promise<VehicleSummary | null> {
    const sql = `SELECT id, registration_number, name, category, manufacturer, model, fuel_type, year, vin, city, group_id, assigned_driver_id, status, odometer_km, engine_hours, maintenance_status, insurance_expiry, registration_expiry, notes, created_at, updated_at FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2`;
    const rows = await this.database.query(sql, [organisationId, id]);
    return rows[0] ?? null;
  }

  async createVehicle(organisationId: string, input: any): Promise<VehicleSummary> {
    const { registrationNumber, name, category, manufacturer, model, fuelType, year, vin, city, groupId, assignedDriverId, status, odometerKm, engineHours, maintenanceStatus, insuranceExpiry, registrationExpiry, notes } = input;
    const sql = `INSERT INTO geoventra.vehicles (organisation_id, registration_number, name, category, manufacturer, model, fuel_type, year, vin, city, group_id, assigned_driver_id, status, odometer_km, engine_hours, maintenance_status, insurance_expiry, registration_expiry, notes, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, now(), now())
                 RETURNING id, registration_number, name, category, manufacturer, model, fuel_type, year, vin, city, group_id, assigned_driver_id, status, odometer_km, engine_hours, maintenance_status, insurance_expiry, registration_expiry, notes, created_at, updated_at`;
    const params = [organisationId, registrationNumber, name, category, manufacturer, model, fuelType, year, vin, city, groupId, assignedDriverId, status, odometerKm, engineHours, maintenanceStatus, insuranceExpiry, registrationExpiry, notes];
    const rows = await this.database.query(sql, params);
    return rows[0];
  }

  async updateVehicle(organisationId: string, id: string, input: any): Promise<VehicleSummary | null> {
    const fields: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    const set = (key: string, value: any) => {
      fields.push(`${key} = $${paramIndex}`);
      params.push(value);
      paramIndex++;
    };

    set('updated_at', new Date().toISOString());
    if (input.registrationNumber) set('registration_number', input.registrationNumber);
    if (input.name) set('name', input.name);
    if (input.category) set('category', input.category);
    if (input.manufacturer) set('manufacturer', input.manufacturer);
    if (input.model) set('model', input.model);
    if (input.fuelType) set('fuel_type', input.fuelType);
    if (input.year) set('year', input.year);
    if (input.vin) set('vin', input.vin);
    if (input.city) set('city', input.city);
    if (input.groupId) set('group_id', input.groupId);
    if (input.assignedDriverId) set('assigned_driver_id', input.assignedDriverId);
    if (input.status) set('status', input.status);
    if (input.odometerKm !== undefined) set('odometer_km', input.odometerKm);
    if (input.engineHours !== undefined) set('engine_hours', input.engineHours);
    if (input.maintenanceStatus) set('maintenance_status', input.maintenanceStatus);
    if (input.insuranceExpiry) set('insurance_expiry', input.insuranceExpiry);
    if (input.registrationExpiry) set('registration_expiry', input.registrationExpiry);
    if (input.notes !== undefined) set('notes', input.notes);

    params.push(organisationId, id);
    const sql = `UPDATE geoventra.vehicles SET ${fields.join(', ')} WHERE organisation_id = $${paramIndex} AND id = $${paramIndex + 1} RETURNING id, registration_number, name, category, manufacturer, model, fuel_type, year, vin, city, group_id, assigned_driver_id, status, odometer_km, engine_hours, maintenance_status, insurance_expiry, registration_expiry, notes, created_at, updated_at`;
    const rows = await this.database.query(sql, params);
    return rows[0] ?? null;
  }

  async deleteVehicle(organisationId: string, id: string): Promise<void> {
    const sql = `DELETE FROM geoventra.vehicles WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, id]);
  }

  async assignDriver(organisationId: string, vehicleId: string, driverId: string): Promise<VehicleSummary | null> {
    const sql = `UPDATE geoventra.vehicles SET assigned_driver_id = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING id, registration_number, name, category, manufacturer, model, fuel_type, year, vin, city, group_id, assigned_driver_id, status, odometer_km, engine_hours, maintenance_status, insurance_expiry, registration_expiry, notes, created_at, updated_at`;
    const rows = await this.database.query(sql, [organisationId, vehicleId, driverId]);
    return rows[0] ?? null;
  }
}
