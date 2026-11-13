/** GEOVENTRA — tyre service.
 *  Tyre records, service workflows and condition monitoring.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';

export type TyreCondition = 'good' | 'fair' | 'poor' | 'replaced' | 'spare';
export type TyreAction = 'installation' | 'removal' | 'replacement' | 'rotation' | 'inspection' | 'puncture_repair' | 'retreading' | 'alignment' | 'balancing' | 'pressure_correction';

export interface TyreRecord {
  id: string;
  vehicleId: string;
  serialNumber: string;
  manufacturer: string;
  brand: string;
  size: string;
  category: string;
  position: string;
  installedOn: string;
  installedOdometerKm: number | null;
  purchasePrice: number | null;
  warrantyExpiresAt: string | null;
  expectedServiceLifeKm: number | null;
  currentCondition: TyreCondition;
  lastServiceAt: string | null;
  lastServiceOdometerKm: number | null;
  lastServiceNotes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TyreServiceRecord {
  id: string;
  vehicleId: string;
  tyreId: string | null;
  action: TyreAction;
  serviceProvider: string | null;
  serviceDate: string;
  odometerKm: number | null;
  cost: number | null;
  notes: string | null;
  technician: string | null;
  nextServiceAt: string | null;
  nextServiceOdometerKm: number | null;
}

@Injectable()
export class TyreService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async listTyres(organisationId: string, query: {
    search?: string;
    vehicleId?: string;
    category?: string;
    condition?: TyreCondition;
    page: number;
    pageSize: number;
  }) {
    const { search, vehicleId, category, condition, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (vehicleId) { where.push(`vehicle_id = $${i}`); params.push(vehicleId); i++; }
    if (category) { where.push(`category = $${i}`); params.push(category); i++; }
    if (condition) { where.push(`current_condition = $${i}`); params.push(condition); i++; }
    if (search) {
      where.push(`(serial_number ILIKE $${i} OR size ILIKE $${i} OR manufacturer ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.tyres WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;

    const dataSql = `SELECT id, vehicle_id AS vehicleId, serial_number, manufacturer, brand, size, category, position, installed_on, installed_odometer_km, purchase_price, warranty_expires_at, expected_service_life_km, current_condition, last_service_at, last_service_odometer_km, last_service_notes, created_at, updated_at FROM geoventra.tyres WHERE ${where.join(' AND ')} ORDER BY position, id LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }

  async getTyre(organisationId: string, tyreId: string) {
    const sql = `SELECT id, vehicle_id AS vehicleId, serial_number, manufacturer, brand, size, category, position, installed_on, installed_odometer_km, purchase_price, warranty_expires_at, expected_service_life_km, current_condition, last_service_at, last_service_odometer_km, last_service_notes, created_at, updated_at FROM geoventra.tyres WHERE organisation_id = $1 AND id = $2`;
    const [row] = await this.database.query(sql, [organisationId, tyreId]);
    if (!row) throw new NotFoundException('Tyre not found');
    return row;
  }

  async createTyre(organisationId: string, input: any) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.tyres (organisation_id, vehicle_id, serial_number, manufacturer, brand, size, category, position, installed_on, installed_odometer_km, purchase_price, warranty_expires_at, expected_service_life_km, current_condition, last_service_at, last_service_odometer_km, last_service_notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, now(), now())
       RETURNING id, vehicle_id AS vehicleId, serial_number, manufacturer, brand, size, category, position, installed_on, installed_odometer_km, purchase_price, warranty_expires_at, expected_service_life_km, current_condition, last_service_at, last_service_odometer_km, last_service_notes, created_at, updated_at`,
      [
        organisationId, input.vehicleId, input.serialNumber, input.manufacturer, input.brand, input.size,
        input.category, input.position, input.installedOn, input.installedOdometerKm || null,
        input.purchasePrice || null, input.warrantyExpiresAt || null, input.expectedServiceLifeKm || null,
        input.currentCondition || 'good', input.lastServiceAt || null, input.lastServiceOdometerKm || null,
        input.lastServiceNotes || null,
      ],
    );
    return row;
  }

  async updateTyre(organisationId: string, tyreId: string, input: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;
    const set = (key: string, value: any) => {
      fields.push(`${key} = $${i}`);
      params.push(value);
      i++;
    };
    set('updated_at', new Date().toISOString());
    if (input.serialNumber !== undefined) set('serial_number', input.serialNumber);
    if (input.manufacturer !== undefined) set('manufacturer', input.manufacturer);
    if (input.brand !== undefined) set('brand', input.brand);
    if (input.size !== undefined) set('size', input.size);
    if (input.category !== undefined) set('category', input.category);
    if (input.position !== undefined) set('position', input.position);
    if (input.installedOn !== undefined) set('installed_on', input.installedOn);
    if (input.installedOdometerKm !== undefined) set('installed_odometer_km', input.installedOdometerKm);
    if (input.purchasePrice !== undefined) set('purchase_price', input.purchasePrice);
    if (input.warrantyExpiresAt !== undefined) set('warranty_expires_at', input.warrantyExpiresAt);
    if (input.expectedServiceLifeKm !== undefined) set('expected_service_life_km', input.expectedServiceLifeKm);
    if (input.currentCondition !== undefined) set('current_condition', input.currentCondition);
    if (input.lastServiceAt !== undefined) set('last_service_at', input.lastServiceAt);
    if (input.lastServiceOdometerKm !== undefined) set('last_service_odometer_km', input.lastServiceOdometerKm);
    if (input.lastServiceNotes !== undefined) set('last_service_notes', input.lastServiceNotes);

    params.push(organisationId, tyreId);
    const sql = `UPDATE geoventra.tyres SET ${fields.join(', ')} WHERE organisation_id = $${i} AND id = $${i + 1} RETURNING id, vehicle_id AS vehicleId, serial_number, manufacturer, brand, size, category, position, installed_on, installed_odometer_km, purchase_price, warranty_expires_at, expected_service_life_km, current_condition, last_service_at, last_service_odometer_km, last_service_notes, created_at, updated_at`;
    const [row] = await this.database.query(sql, params);
    if (!row) throw new NotFoundException('Tyre not found');
    return row;
  }

  async deleteTyre(organisationId: string, tyreId: string) {
    const sql = `UPDATE geoventra.tyres SET current_condition = 'replaced', updated_at = now() WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, tyreId]);
    return { deleted: true };
  }

  async recordService(organisationId: string, input: any) {
    const [row] = await this.database.query(
      `INSERT INTO geoventra.tyre_services (organisation_id, vehicle_id, tyre_id, action, service_provider, service_date, odometer_km, cost, notes, technician, next_service_at, next_service_odometer_km)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id, vehicle_id AS vehicleId, tyre_id, action, service_provider, service_date, odometer_km, cost, notes, technician, next_service_at, next_service_odometer_km`,
      [
        organisationId, input.vehicleId, input.tyreId || null, input.action,
        input.serviceProvider || null, input.serviceDate, input.odometerKm || null,
        input.cost || null, input.notes || null, input.technician || null,
        input.nextServiceAt || null, input.nextServiceOdometerKm || null,
      ],
    );
    await this.adminService.createAuditLog(organisationId, input.email, `TYRE_${input.action.toUpperCase()}`, 'tyre', row.id, { vehicleId: input.vehicleId });
    return row;
  }

  async listServices(organisationId: string, query: { vehicleId?: string; tyreId?: string; page: number; pageSize: number }) {
    const { vehicleId, tyreId, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;
    if (vehicleId) { where.push(`vehicle_id = $${i}`); params.push(vehicleId); i++; }
    if (tyreId) { where.push(`tyre_id = $${i}`); params.push(tyreId); i++; }
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.tyre_services WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;
    const dataSql = `SELECT id, vehicle_id AS vehicleId, tyre_id, action, service_provider, service_date, odometer_km, cost, notes, technician, next_service_at, next_service_odometer_km FROM geoventra.tyre_services WHERE ${where.join(' AND ')} ORDER BY service_date DESC, id DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);
    const [rows] = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize } };
  }
}
