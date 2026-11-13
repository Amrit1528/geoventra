/** GEOVENTRA — device service.
 *  Device lifecycle and pairing management.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';

export type DeviceStatus = 'online' | 'offline' | 'degraded' | 'unassigned';

export interface DeviceSummary {
  id: string;
  deviceId: string;
  deviceType: string;
  imei: string | null;
  model: string;
  firmwareVersion: string;
  provider: string;
  status: DeviceStatus;
  lastCommunicationAt: string | null;
  createdAt: string;
}

export interface DeviceDetail extends DeviceSummary {
  serialNumber: string | null;
  macAddress: string | null;
  installationDate: string | null;
  installedAtLocation: string | null;
  warrantyExpiresAt: string | null;
  lastFirmwareAt: string | null;
  capabilities: string[];
  supportedTelemetry: string[];
  integrationMethod: string;
  deviceCategory: string;
  manufacturerId: string | null;
  modelId: string | null;
  connectionStatus: string;
  connectionState: string;
  messagesLastHour: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  latencyMs: number | null;
  lastDiscovery: Record<string, unknown> | null;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adminService: AdminService,
  ) {}

  async listDevices(organisationId: string, query: {
    search?: string;
    deviceType?: string;
    category?: string;
    status?: DeviceStatus;
    page: number;
    pageSize: number;
  }) {
    const { search, deviceType, category, status, page, pageSize } = query;
    const where: string[] = ['organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (search) {
      where.push(`(device_id ILIKE $${i} OR imei ILIKE $${i} OR model ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (deviceType) {
      where.push(`device_type = $${i}`); params.push(deviceType); i++;
    }
    if (category) {
      where.push(`device_category = $${i}`); params.push(category); i++;
    }
    if (status) {
      where.push(`status = $${i}`); params.push(status); i++;
    }

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.devices WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;

    const dataSql = `SELECT id, device_id AS deviceId, device_type AS deviceType, imei, model, firmware_version AS firmwareVersion, provider, status, last_communication_at AS lastCommunicationAt, organisation_id AS organisationId, serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, config FROM geoventra.devices WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const rows = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))) } };
  }

  async getDevice(organisationId: string, deviceId: string) {
    const sql = `SELECT id, device_id AS deviceId, device_type AS deviceType, imei, model, firmware_version AS firmwareVersion, provider, status, last_communication_at AS lastCommunicationAt, organisation_id AS organisationId, serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, config FROM geoventra.devices WHERE organisation_id = $1 AND id = $2`;
    const row = await this.database.queryOne<any>(sql, [organisationId, deviceId]);
    if (!row) throw new NotFoundException('Device not found');
    return this.enrichDevice(row);
  }

  async getDeviceBySerial(organisationId: string, deviceId: string) {
    const sql = `SELECT id, device_id AS deviceId, device_type AS deviceType, imei, model, firmware_version AS firmwareVersion, provider, status, last_communication_at AS lastCommunicationAt, organisation_id AS organisationId, serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, config FROM geoventra.devices WHERE organisation_id = $1 AND device_id = $2`;
    const row = await this.database.queryOne<any>(sql, [organisationId, deviceId]);
    if (!row) throw new NotFoundException('Device not found');
    return this.enrichDevice(row);
  }

  private enrichDevice(row: any): DeviceDetail {
    return {
      ...row,
      serialNumber: row.serial_number,
      macAddress: row.mac_address,
      installationDate: row.installation_date ? row.installation_date.toISOString() : null,
      installedAtLocation: row.installed_at_location,
      warrantyExpiresAt: row.warranty_expires_at ? row.warranty_expires_at.toISOString() : null,
      lastFirmwareAt: row.last_firmware_at ? row.last_firmware_at.toISOString() : null,
      capabilities: [],
      supportedTelemetry: [],
      integrationMethod: row.integration_method,
      deviceCategory: row.device_category,
      manufacturerId: row.manufacturer_id,
      modelId: row.model_id,
      connectionStatus: 'stable',
      connectionState: row.status,
      messagesLastHour: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      latencyMs: null,
      lastDiscovery: null,
    };
  }

  async createDevice(organisationId: string, input: any) {
    const required = ['deviceId', 'deviceType', 'model', 'provider'];
    for (const f of required) {
      if (!input[f]) throw new Error(`Missing required field: ${f}`);
    }
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.devices (organisation_id, device_id, device_type, imei, model, firmware_version, provider, status, connection_method, connection_config, integration_method, serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, now(), now())
       RETURNING id, device_id AS deviceId, device_type AS deviceType, imei, model, firmware_version AS firmwareVersion, provider, status, last_communication_at AS lastCommunicationAt, organisation_id AS organisationId, serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, config`,
      [
        organisationId, input.deviceId, input.deviceType, input.imei || null, input.model,
        input.firmwareVersion || '1.0.0', input.provider, input.status || 'unassigned',
        input.connectionMethod || 'api', input.connectionConfig || {}, input.integrationMethod || 'mqtt',
        input.serialNumber || null, input.macAddress || null, input.installationDate || null,
        input.installedAtLocation || null, input.warrantyExpiresAt || null, input.lastFirmwareAt || null,
        input.metadata || {},
      ],
    );
    return this.enrichDevice(row);
  }

  async updateDevice(organisationId: string, deviceId: string, input: any) {
    const fields: string[] = [];
    const params: any[] = [];
    let i = 1;

    const set = (key: string, value: any) => {
      fields.push(`${key} = $${i}`);
      params.push(value);
      i++;
    };

    set('updated_at', new Date().toISOString());
    if (input.status !== undefined) set('status', input.status);
    if (input.model !== undefined) set('model', input.model);
    if (input.firmwareVersion !== undefined) set('firmware_version', input.firmwareVersion);
    if (input.provider !== undefined) set('provider', input.provider);
    if (input.connectionConfig !== undefined) set('connection_config', input.connectionConfig);
    if (input.integrationMethod !== undefined) set('integration_method', input.integrationMethod);
    if (input.serialNumber !== undefined) set('serial_number', input.serialNumber);
    if (input.macAddress !== undefined) set('mac_address', input.macAddress);
    if (input.installationDate !== undefined) set('installation_date', input.installationDate);
    if (input.installedAtLocation !== undefined) set('installed_at_location', input.installedAtLocation);
    if (input.warrantyExpiresAt !== undefined) set('warranty_expires_at', input.warrantyExpiresAt);
    if (input.lastFirmwareAt !== undefined) set('last_firmware_at', input.lastFirmwareAt);
    if (input.metadata !== undefined) set('metadata', input.metadata);

    params.push(organisationId, deviceId);
    const sql = `UPDATE geoventra.devices SET ${fields.join(', ')} WHERE organisation_id = $${i} AND id = $${i + 1} RETURNING id, device_id AS deviceId, device_type AS deviceType, imei, model, firmware_version AS firmwareVersion, provider, status, last_communication_at AS lastCommunicationAt, organisation_id AS organisationId, serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, config`;
    const row = await this.database.queryOne<any>(sql, params);
    if (!row) throw new NotFoundException('Device not found');
    return this.enrichDevice(row);
  }

  async deleteDevice(organisationId: string, deviceId: string) {
    const sql = `UPDATE geoventra.devices SET status = 'unassigned', updated_at = now() WHERE organisation_id = $1 AND id = $2`;
    await this.database.query(sql, [organisationId, deviceId]);
    return { deleted: true };
  }

  async assignDevice(organisationId: string, deviceId: string, vehicleId: string, input: { assignedBy?: string; reason?: string }) {
    return this.database.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO geoventra.device_assignments (organisation_id, device_id, vehicle_id, assigned_at, assigned_by) VALUES ($1, $2, $3, now(), $4) RETURNING id`,
        [organisationId, deviceId, vehicleId, input.assignedBy ?? null],
      );
      const [row] = result.rows;
      await this.createAssignmentHistory(organisationId, deviceId, vehicleId, 'assigned', input.reason ?? null, input.assignedBy ?? null);
      return { assigned: true, assignmentId: row.id };
    });
  }

  async unassignDevice(organisationId: string, deviceId: string, input: { unassignedBy?: string; reason?: string }) {
    return this.database.transaction(async (client) => {
      await client.query(
        `UPDATE geoventra.device_assignments SET unassigned_at = now() WHERE device_id = $1 AND unassigned_at IS NULL`,
        [deviceId],
      );
      await this.createAssignmentHistory(organisationId, deviceId, null, 'unassigned', input.reason ?? null, input.unassignedBy ?? null);
      return { unassigned: true };
    });
  }

  async replaceDevice(organisationId: string, oldDeviceId: string, newDeviceId: string, vehicleId: string) {
    return this.database.transaction(async (client) => {
      await client.query(
        `UPDATE geoventra.device_assignments SET unassigned_at = now() WHERE device_id = $1 AND unassigned_at IS NULL`,
        [oldDeviceId],
      );
      const result = await client.query(
        `INSERT INTO geoventra.device_assignments (organisation_id, device_id, vehicle_id, assigned_at) VALUES ($1, $2, $3, now()) RETURNING id`,
        [organisationId, newDeviceId, vehicleId],
      );
      const [row] = result.rows;
      await this.createAssignmentHistory(organisationId, oldDeviceId, vehicleId, 'replaced', 'device replacement', null);
      return { replaced: true, assignmentId: row.id };
    });
  }

  async getAssignmentHistory(organisationId: string, deviceId: string, query: { page: number; pageSize: number }) {
    const { page, pageSize } = query;
    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.device_assignment_history WHERE organisation_id = $1 AND device_id = $2`;
    const countResult = await this.database.query(countSql, [organisationId, deviceId]);
    const total = countResult.length > 0 ? Number((countResult[0] as any)?.total ?? 0) : 0;

    const dataSql = `SELECT id, device_id AS deviceId, vehicle_id AS vehicleId, action, reason, performed_by AS performedBy, performed_at AS performedAt FROM geoventra.device_assignment_history WHERE organisation_id = $1 AND device_id = $2 ORDER BY performed_at DESC LIMIT $3 OFFSET $4`;
    const rows = await this.database.query(dataSql, [organisationId, deviceId, pageSize, (page - 1) * pageSize]);

    const data = rows.map((r: any) => ({
      id: r.id,
      deviceId: r.deviceId,
      vehicleId: r.vehicleId,
      action: r.action,
      reason: r.reason,
      performedBy: r.performedBy,
      performedAt: r.performedAt,
    }));

    return { data, meta: { total, page, pageSize } };
  }

  private async createAssignmentHistory(organisationId: string, deviceId: string, vehicleId: string | null, action: string, reason: string | null | undefined, performedBy: string | null | undefined) {
    const performedBySafe = performedBy ?? null;
    await this.database.query(
      `INSERT INTO geoventra.device_assignment_history (organisation_id, device_id, vehicle_id, action, reason, performed_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [organisationId, deviceId, vehicleId, action, reason ?? null, performedBySafe],
    );
    await this.adminService.createAuditLog(organisationId, performedBySafe, `DEVICE_${action.toUpperCase()}`, 'device', deviceId, { vehicleId });
  }
}
