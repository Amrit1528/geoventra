/** GEOVENTRA — device service.
 *  Device lifecycle and pairing management.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';
import { isValidImei } from './imei.util.js';

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
  protocol: string | null;
  serverAddress: string | null;
  connectionMethod: string;
  vehicleId: string | null;
  vehicleRegistration: string | null;
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
    activeFlag?: any;
    active?: any;
    page: number;
    pageSize: number;
  }) {
    const { search, deviceType, category, status, page, pageSize } = query;
    const where: string[] = ['d.organisation_id = $1'];
    const params: any[] = [organisationId];
    let i = 2;

    if (search) {
      where.push(`(d.device_id ILIKE $${i} OR d.imei ILIKE $${i} OR d.model ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (deviceType) {
      where.push(`d.device_type = $${i}`); params.push(deviceType); i++;
    }
    if (category) {
      where.push(`d.device_category = $${i}`); params.push(category); i++;
    }
    if (status) {
      where.push(`d.status = $${i}`); params.push(status); i++;
    }
    const activeRaw = query.activeFlag ?? query.active;
    if (activeRaw !== undefined && activeRaw !== null && activeRaw !== '' && activeRaw !== 'all') {
      const val = String(activeRaw).toLowerCase();
      if (val === 'true' || val === '1' || val === 'active') { where.push(`d.active_flag = TRUE`); }
      else if (val === 'false' || val === '0' || val === 'inactive') { where.push(`d.active_flag = FALSE`); }
    }

    // Current (active) assignment. A device may only have one open assignment,
    // but ordering keeps the result deterministic if legacy rows exist.
    const assignmentSql = `
      (SELECT da.vehicle_id FROM geoventra.device_assignments da
        WHERE da.device_id = d.id AND da.organisation_id = d.organisation_id AND da.unassigned_at IS NULL
        ORDER BY da.assigned_at DESC LIMIT 1) AS "vehicleId",
      (SELECT v.registration_number FROM geoventra.device_assignments da
        JOIN geoventra.vehicles v ON v.id = da.vehicle_id AND v.organisation_id = da.organisation_id
        WHERE da.device_id = d.id AND da.organisation_id = d.organisation_id AND da.unassigned_at IS NULL
        ORDER BY da.assigned_at DESC LIMIT 1) AS "vehicleRegistration"`;

    const countSql = `SELECT COUNT(*)::int AS total FROM geoventra.devices d WHERE ${where.join(' AND ')}`;
    const countResult = await this.database.query(countSql, params);
    const total = countResult.length > 0 ? (countResult[0] as any)?.total ?? 0 : 0;

    const dataSql = `SELECT d.id, d.device_id AS "deviceId", d.device_type AS "deviceType", d.imei, d.model, d.firmware_version AS "firmwareVersion", d.provider, d.status, d.last_communication_at AS "lastCommunicationAt", d.last_seen_at AS "lastSeenAt", d.offline_since AS "offlineSince", d.last_status_change_at AS "lastStatusChangeAt", d.connectivity_status AS "connectivityStatus", d.offline_reason AS "offlineReason", d.organisation_id AS "organisationId", d.serial_number, d.mac_address, d.installation_date, d.installed_at_location, d.warranty_expires_at, d.last_firmware_at, d.metadata, d.manufacturer_id, d.model_id, d.integration_method, d.protocol, d.server_address AS "serverAddress", d.connection_method AS "connectionMethod", d.config, d.active_flag AS "activeFlag", ${assignmentSql} FROM geoventra.devices d WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    params.push(pageSize, (page - 1) * pageSize);

    const rows = await this.database.query(dataSql, params);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))) } };
  }

  async getDevice(organisationId: string, deviceId: string) {
    const sql = `SELECT id, device_id AS "deviceId", device_type AS "deviceType", imei, model, firmware_version AS "firmwareVersion", provider, status, last_communication_at AS "lastCommunicationAt", last_seen_at AS "lastSeenAt", offline_since AS "offlineSince", last_status_change_at AS "lastStatusChangeAt", connectivity_status AS "connectivityStatus", offline_reason AS "offlineReason", organisation_id AS "organisationId", serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, protocol, server_address AS "serverAddress", connection_method AS "connectionMethod", config, active_flag AS "activeFlag",
      (SELECT da.vehicle_id FROM geoventra.device_assignments da WHERE da.device_id = $2 AND da.organisation_id = $1 AND da.unassigned_at IS NULL ORDER BY da.assigned_at DESC LIMIT 1) AS "vehicleId",
      (SELECT v.registration_number FROM geoventra.device_assignments da JOIN geoventra.vehicles v ON v.id = da.vehicle_id AND v.organisation_id = da.organisation_id WHERE da.device_id = $2 AND da.organisation_id = $1 AND da.unassigned_at IS NULL ORDER BY da.assigned_at DESC LIMIT 1) AS "vehicleRegistration"
      FROM geoventra.devices WHERE organisation_id = $1 AND id = $2`;
    const row = await this.database.queryOne<any>(sql, [organisationId, deviceId]);
    if (!row) throw new NotFoundException('Device not found');
    return this.enrichDevice(row);
  }

  async getDeviceBySerial(organisationId: string, deviceId: string) {
    const sql = `SELECT id, device_id AS "deviceId", device_type AS "deviceType", imei, model, firmware_version AS "firmwareVersion", provider, status, last_communication_at AS "lastCommunicationAt", last_seen_at AS "lastSeenAt", offline_since AS "offlineSince", last_status_change_at AS "lastStatusChangeAt", connectivity_status AS "connectivityStatus", offline_reason AS "offlineReason", organisation_id AS "organisationId", serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, protocol, server_address AS "serverAddress", connection_method AS "connectionMethod", config, active_flag AS "activeFlag" FROM geoventra.devices WHERE organisation_id = $1 AND device_id = $2`;
    const row = await this.database.queryOne<any>(sql, [organisationId, deviceId]);
    if (!row) throw new NotFoundException('Device not found');
    return this.enrichDevice(row);
  }

  private enrichDevice(row: any): DeviceDetail {
    return {
      ...row,
      activeFlag: row.activeFlag ?? row.active_flag ?? true,
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
    if (!input.deviceId) throw new Error('Missing required field: deviceId');
    if (!input.provider) throw new Error('Missing required field: provider');
    if (input.imei) {
      if (!isValidImei(input.imei)) throw new Error('Invalid IMEI');
    }
    const connectionMethod = String(input.connectionMethod || input.connection_method || 'tcp').toLowerCase();
    const requestedIntegration = String(input.integrationMethod || connectionMethod).toUpperCase();
    const integrationMethod = ['API', 'WEBHOOK', 'MQTT', 'TCP'].includes(requestedIntegration) ? requestedIntegration : 'API';
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.devices (organisation_id, device_id, device_type, imei, model, firmware_version, provider, status, connection_method, connection_config, integration_method, serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, protocol, server_address, active_flag, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21, now(), now())
       RETURNING id, device_id AS "deviceId", device_type AS "deviceType", imei, model, firmware_version AS "firmwareVersion", provider, status, last_communication_at AS "lastCommunicationAt", last_seen_at AS "lastSeenAt", offline_since AS "offlineSince", last_status_change_at AS "lastStatusChangeAt", connectivity_status AS "connectivityStatus", offline_reason AS "offlineReason", organisation_id AS "organisationId", serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, protocol, server_address AS "serverAddress", connection_method AS "connectionMethod", config, active_flag AS "activeFlag"`,
      [
        organisationId, input.deviceId, input.deviceType || 'gps_tracker', input.imei || null, input.model || 'Generic tracker',
        input.firmwareVersion || '1.0.0', input.provider, input.status || 'unassigned',
        connectionMethod, input.connectionConfig || {}, integrationMethod,
        input.serialNumber || null, input.macAddress || null, input.installationDate || null,
        input.installedAtLocation || null, input.warrantyExpiresAt || null, input.lastFirmwareAt || null,
        input.metadata || {},
        input.protocol || null, input.serverAddress || input.server_address || null,
        input.activeFlag ?? input.active_flag ?? true,
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
    if (input.activeFlag !== undefined) set('active_flag', input.activeFlag);
    if (input.active_flag !== undefined) set('active_flag', input.active_flag);
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
    if (input.deviceType !== undefined) set('device_type', input.deviceType);
    if (input.imei !== undefined && input.imei !== null && String(input.imei).trim() !== '') {
      if (!isValidImei(String(input.imei))) throw new Error('Invalid IMEI');
      set('imei', input.imei);
    }
    if (input.protocol !== undefined) set('protocol', input.protocol);
    if (input.serverAddress !== undefined) set('server_address', input.serverAddress);
    if (input.server_address !== undefined) set('server_address', input.server_address);
    if (input.connectionMethod !== undefined) set('connection_method', input.connectionMethod);
    if (input.connection_method !== undefined) set('connection_method', input.connection_method);

    params.push(organisationId, deviceId);
    const sql = `UPDATE geoventra.devices SET ${fields.join(', ')} WHERE organisation_id = $${i} AND id = $${i + 1} RETURNING id, device_id AS "deviceId", device_type AS "deviceType", imei, model, firmware_version AS "firmwareVersion", provider, status, last_communication_at AS "lastCommunicationAt", last_seen_at AS "lastSeenAt", offline_since AS "offlineSince", last_status_change_at AS "lastStatusChangeAt", connectivity_status AS "connectivityStatus", offline_reason AS "offlineReason", organisation_id AS "organisationId", serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, protocol, server_address AS "serverAddress", connection_method AS "connectionMethod", config, active_flag AS "activeFlag"`;
    const row = await this.database.queryOne<any>(sql, params);
    if (!row) throw new NotFoundException('Device not found');
    return this.enrichDevice(row);
  }

  async setStatus(organisationId: string, deviceId: string, activeFlag: boolean, changedBy?: string | null, reason?: string | null) {
    const existing = await this.database.queryOne<any>('SELECT id, active_flag FROM geoventra.devices WHERE organisation_id = $1 AND id = $2', [organisationId, deviceId]);
    if (!existing) throw new NotFoundException('Device not found');
    const previous = existing.active_flag;
    const row = await this.database.queryOne<any>('UPDATE geoventra.devices SET active_flag = $3, updated_at = now() WHERE organisation_id = $1 AND id = $2 RETURNING id, device_id AS "deviceId", device_type AS "deviceType", imei, model, firmware_version AS "firmwareVersion", provider, status, last_communication_at AS "lastCommunicationAt", last_seen_at AS "lastSeenAt", offline_since AS "offlineSince", last_status_change_at AS "lastStatusChangeAt", connectivity_status AS "connectivityStatus", offline_reason AS "offlineReason", organisation_id AS "organisationId", serial_number, mac_address, installation_date, installed_at_location, warranty_expires_at, last_firmware_at, metadata, manufacturer_id, model_id, integration_method, protocol, server_address AS "serverAddress", connection_method AS "connectionMethod", config, active_flag AS "activeFlag"', [organisationId, deviceId, activeFlag]);
    if (!row) throw new NotFoundException('Device not found');
    try { await this.adminService.createAuditLog(organisationId, changedBy ?? null, activeFlag ? 'DEVICE_ENABLED' : 'DEVICE_DISABLED', 'device', deviceId, { previousActiveFlag: previous, newActiveFlag: activeFlag, reason: reason ?? null }); } catch {}
    return this.enrichDevice(row);
  }

  async deleteDevice(organisationId: string, deviceId: string) {
    const existing = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id = $1 AND id = $2', [organisationId, deviceId]);
    if (!existing) throw new NotFoundException('Device not found');
    await this.database.query('DELETE FROM geoventra.devices WHERE organisation_id = $1 AND id = $2', [organisationId, deviceId]);
    return { deleted: true };
  }

  async assignDevice(organisationId: string, deviceId: string, vehicleId: string, input: { assignedBy?: string; reason?: string }) {
    const device = await this.database.queryOne<any>('SELECT id, active_flag FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    if (!device.active_flag) throw new Error('Cannot assign an inactive device');
    const vehicle = await this.database.queryOne<any>('SELECT id, active_flag FROM geoventra.vehicles WHERE organisation_id=$1 AND id=$2', [organisationId, vehicleId]);
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (!vehicle.active_flag) throw new Error('Cannot assign a device to an inactive vehicle');
    return this.database.transaction(async (client) => {
      // Only one active assignment per device and per vehicle is allowed.
      await client.query(
        `UPDATE geoventra.device_assignments SET unassigned_at = now()
          WHERE organisation_id = $1 AND unassigned_at IS NULL AND (device_id = $2 OR vehicle_id = $3)`,
        [organisationId, deviceId, vehicleId],
      );
      const result = await client.query(
        `INSERT INTO geoventra.device_assignments (organisation_id, device_id, vehicle_id, assigned_at) VALUES ($1, $2, $3, now()) RETURNING id`,
        [organisationId, deviceId, vehicleId],
      );
      const [row] = result.rows;
      await this.createAssignmentHistory(organisationId, deviceId, vehicleId, 'assigned', input.reason ?? null, input.assignedBy ?? null);
      return { assigned: true, assignmentId: row.id };
    });
  }

  async unassignDevice(organisationId: string, deviceId: string, input: { unassignedBy?: string; reason?: string }) {
    return this.database.transaction(async (client) => {
      await client.query(
        `UPDATE geoventra.device_assignments SET unassigned_at = now() WHERE organisation_id = $1 AND device_id = $2 AND unassigned_at IS NULL`,
        [organisationId, deviceId],
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
    const countResult = await this.database.query<any>(countSql, [organisationId, deviceId]).catch(() => []);
    const total = countResult.length > 0 ? Number((countResult[0] as any)?.total ?? 0) : 0;

    const dataSql = `SELECT id, device_id AS "deviceId", vehicle_id AS "vehicleId", action, reason, performed_by AS "performedBy", performed_at AS "performedAt" FROM geoventra.device_assignment_history WHERE organisation_id = $1 AND device_id = $2 ORDER BY performed_at DESC LIMIT $3 OFFSET $4`;
    const rows = await this.database.query<any>(dataSql, [organisationId, deviceId, pageSize, (page - 1) * pageSize]).catch(() => []);
    return { data: rows, meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / Math.max(1, pageSize))) } };
  }

  async stats(organisationId: string) {
    const row = await this.database.queryOne<any>(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status='online')::int AS online,
         COUNT(*) FILTER (WHERE status='offline')::int AS offline,
         COUNT(*) FILTER (WHERE status='degraded')::int AS degraded,
         COUNT(*) FILTER (WHERE status='unassigned')::int AS unassigned,
         COUNT(*) FILTER (WHERE last_communication_at >= now() - interval '24 hours')::int AS "active24h",
         COUNT(*) FILTER (WHERE last_communication_at IS NULL OR last_communication_at < now() - interval '24 hours')::int AS "stale24h"
       FROM geoventra.devices WHERE organisation_id = $1`,
      [organisationId],
    ).catch(() => null);
    return row ?? { total: 0, online: 0, offline: 0, degraded: 0, unassigned: 0, active24h: 0, stale24h: 0 };
  }

  // ── Pictor device configuration ──────────────────────────────────────────
  async getConfiguration(organisationId: string, deviceId: string) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    const row = await this.database.queryOne<any>('SELECT * FROM geoventra.device_configurations WHERE organisation_id=$1 AND device_id=$2 ORDER BY created_at DESC LIMIT 1', [organisationId, deviceId]);
    return row ?? null;
  }

  async upsertConfiguration(organisationId: string, deviceId: string, input: any, createdBy?: string | null) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.device_configurations (organisation_id, device_id, model_id, apn, sim_number, server_host, server_port, transport_mode, reporting_interval_seconds, heartbeat_interval_seconds, gps_upload_enabled, sleep_mode, geofence_config, alarm_config, raw_config, applied_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,$16,$17)
       RETURNING *`,
      [
        organisationId, deviceId, input.modelId ?? null, input.apn ?? null, input.simNumber ?? null,
        input.serverHost ?? input.server_host ?? null, input.serverPort ?? input.server_port ?? null,
        String(input.transportMode ?? input.transport_mode ?? 'tcp').toLowerCase(),
        input.reportingIntervalSeconds ?? input.reporting_interval_seconds ?? null,
        input.heartbeatIntervalSeconds ?? input.heartbeat_interval_seconds ?? null,
        input.gpsUploadEnabled ?? input.gps_upload_enabled ?? true,
        input.sleepMode ?? input.sleep_mode ?? null,
        JSON.stringify(input.geofenceConfig ?? input.geofence_config ?? {}),
        JSON.stringify(input.alarmConfig ?? input.alarm_config ?? {}),
        JSON.stringify(input.rawConfig ?? input.raw_config ?? input.config ?? {}),
        input.appliedAt ?? null, createdBy ?? null,
      ],
    );
    return row;
  }

  // ── Pictor device commands ───────────────────────────────────────────────
  async listCommands(organisationId: string, deviceId: string, query: { page: number; pageSize: number }) {
    const { page, pageSize } = query;
    const rows = await this.database.query<any>(
      `SELECT * FROM geoventra.device_commands WHERE organisation_id=$1 AND device_id=$2 ORDER BY created_at DESC LIMIT $3 OFFSET $4`,
      [organisationId, deviceId, pageSize, (page - 1) * pageSize],
    );
    return { data: rows, meta: { page, pageSize, total: rows.length } };
  }

  async createCommand(organisationId: string, deviceId: string, input: any, createdBy?: string | null) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.device_commands (organisation_id, device_id, command_type, payload, status, priority, max_retries, timeout_seconds, correlation_id, created_by)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        organisationId, deviceId, input.commandType ?? input.command_type,
        JSON.stringify(input.payload ?? {}), input.status ?? 'pending',
        Number(input.priority ?? 5), Number(input.maxRetries ?? input.max_retries ?? 3),
        Number(input.timeoutSeconds ?? input.timeout_seconds ?? 60),
        input.correlationId ?? input.correlation_id ?? null, createdBy ?? null,
      ],
    );
    return row;
  }

  async updateCommandStatus(organisationId: string, commandId: string, status: string, reason?: string | null) {
    const fields = ['status=$3', 'updated_at=now()'];
    const params: any[] = [organisationId, commandId, status];
    let i = 4;
    if (status === 'sent') { fields.push(`sent_at=now()`); }
    if (status === 'acknowledged') { fields.push(`acknowledged_at=now()`); }
    if (status === 'failed') { fields.push(`failed_at=now()`); if (reason) { fields.push(`failure_reason=$${i}`); params.push(reason); i++; } }
    if (status === 'expired') { fields.push(`expired_at=now()`); }
    const sql = `UPDATE geoventra.device_commands SET ${fields.join(', ')} WHERE organisation_id=$1 AND id=$2 RETURNING *`;
    const row = await this.database.queryOne<any>(sql, params);
    return row;
  }

  async recordCommandAck(organisationId: string, commandId: string, payload: any) {
    const cmd = await this.database.queryOne<any>('SELECT id, device_id FROM geoventra.device_commands WHERE organisation_id=$1 AND id=$2', [organisationId, commandId]);
    if (!cmd) throw new NotFoundException('Command not found');
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.device_command_acks (organisation_id, command_id, device_id, payload) VALUES ($1,$2,$3,$4::jsonb) RETURNING *`,
      [organisationId, commandId, cmd.device_id, JSON.stringify(payload ?? {})],
    );
    await this.database.query(`UPDATE geoventra.device_commands SET status='acknowledged', acknowledged_at=now(), updated_at=now() WHERE organisation_id=$1 AND id=$2`, [organisationId, commandId]);
    return row;
  }

  // ── Pictor device firmware ───────────────────────────────────────────────
  async getFirmware(organisationId: string, deviceId: string) {
    const rows = await this.database.query<any>('SELECT * FROM geoventra.device_firmware WHERE organisation_id=$1 AND device_id=$2 ORDER BY created_at DESC', [organisationId, deviceId]);
    return rows;
  }

  async upsertFirmware(organisationId: string, deviceId: string, input: any) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.device_firmware (organisation_id, device_id, firmware_version, hardware_revision, ota_capable, compatibility, update_status, update_progress, update_result, installed_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb) RETURNING *`,
      [
        organisationId, deviceId, input.firmwareVersion ?? input.firmware_version ?? 'unknown',
        input.hardwareRevision ?? input.hardware_revision ?? null,
        Boolean(input.otaCapable ?? input.ota_capable ?? false),
        input.compatibility ?? null, input.updateStatus ?? input.update_status ?? 'idle',
        input.updateProgress ?? input.update_progress ?? null,
        input.updateResult ?? input.update_result ?? null,
        input.installedAt ?? input.installed_at ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );
    return row;
  }

  // ── Pictor device telemetry / alarms / health / battery / sensors ────────
  async listDeviceTelemetry(organisationId: string, deviceId: string, limit = 100) {
    return this.database.query<any>('SELECT * FROM geoventra.device_telemetry WHERE organisation_id=$1 AND device_id=$2 ORDER BY recorded_at DESC LIMIT $3', [organisationId, deviceId, Math.min(Math.max(Number(limit) || 100, 1), 500)]);
  }

  async addDeviceTelemetry(organisationId: string, deviceId: string, input: any) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    return this.database.queryOne<any>(
      `INSERT INTO geoventra.device_telemetry (organisation_id, device_id, metric, value, unit, recorded_at, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [organisationId, deviceId, input.metric, input.value ?? null, input.unit ?? null, input.recordedAt ?? input.recorded_at ?? new Date().toISOString(), JSON.stringify(input.metadata ?? {})],
    );
  }

  async listDeviceAlarms(organisationId: string, deviceId: string, limit = 100) {
    return this.database.query<any>('SELECT * FROM geoventra.device_alarms WHERE organisation_id=$1 AND device_id=$2 ORDER BY occurred_at DESC LIMIT $3', [organisationId, deviceId, Math.min(Math.max(Number(limit) || 100, 1), 500)]);
  }

  async addDeviceAlarm(organisationId: string, deviceId: string, input: any) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    return this.database.queryOne<any>(
      `INSERT INTO geoventra.device_alarms (organisation_id, device_id, alarm_type, severity, message, occurred_at, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [organisationId, deviceId, input.alarmType ?? input.alarm_type, input.severity ?? 'medium', input.message ?? null, input.occurredAt ?? input.occurred_at ?? new Date().toISOString(), JSON.stringify(input.metadata ?? {})],
    );
  }

  async listDeviceHealth(organisationId: string, deviceId: string, limit = 100) {
    return this.database.query<any>('SELECT * FROM geoventra.device_health WHERE organisation_id=$1 AND device_id=$2 ORDER BY recorded_at DESC LIMIT $3', [organisationId, deviceId, Math.min(Math.max(Number(limit) || 100, 1), 500)]);
  }

  async recordDeviceHealth(organisationId: string, deviceId: string, input: any) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    return this.database.queryOne<any>(
      `INSERT INTO geoventra.device_health (organisation_id, device_id, signal_strength, network_status, latency_ms, messages_last_hour, consecutive_failures, last_error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [organisationId, deviceId, input.signalStrength ?? input.signal_strength ?? null, input.networkStatus ?? input.network_status ?? null, input.latencyMs ?? input.latency_ms ?? null, Number(input.messagesLastHour ?? input.messages_last_hour ?? 0), Number(input.consecutiveFailures ?? input.consecutive_failures ?? 0), input.lastError ?? input.last_error ?? null],
    );
  }

  async listDeviceBattery(organisationId: string, deviceId: string, limit = 100) {
    return this.database.query<any>('SELECT * FROM geoventra.device_battery_history WHERE organisation_id=$1 AND device_id=$2 ORDER BY recorded_at DESC LIMIT $3', [organisationId, deviceId, Math.min(Math.max(Number(limit) || 100, 1), 500)]);
  }

  async recordDeviceBattery(organisationId: string, deviceId: string, input: any) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    return this.database.queryOne<any>(
      `INSERT INTO geoventra.device_battery_history (organisation_id, device_id, percent, voltage, charging_status, external_power_status, power_source) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [organisationId, deviceId, input.percent ?? null, input.voltage ?? null, input.chargingStatus ?? input.charging_status ?? null, input.externalPowerStatus ?? input.external_power_status ?? null, input.powerSource ?? input.power_source ?? null],
    );
  }

  async listDeviceSensors(organisationId: string, deviceId: string, limit = 100) {
    return this.database.query<any>('SELECT * FROM geoventra.device_sensor_readings WHERE organisation_id=$1 AND device_id=$2 ORDER BY recorded_at DESC LIMIT $3', [organisationId, deviceId, Math.min(Math.max(Number(limit) || 100, 1), 500)]);
  }

  async recordDeviceSensor(organisationId: string, deviceId: string, input: any) {
    const device = await this.database.queryOne<any>('SELECT id FROM geoventra.devices WHERE organisation_id=$1 AND id=$2', [organisationId, deviceId]);
    if (!device) throw new NotFoundException('Device not found');
    return this.database.queryOne<any>(
      `INSERT INTO geoventra.device_sensor_readings (organisation_id, device_id, sensor_type, channel, value, unit, metadata) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING *`,
      [organisationId, deviceId, input.sensorType ?? input.sensor_type, input.channel ?? null, input.value ?? null, input.unit ?? null, JSON.stringify(input.metadata ?? {})],
    );
  }

  async deviceEventTimeline(organisationId: string, deviceId: string, limit = 100) {
    const alarms = await this.listDeviceAlarms(organisationId, deviceId, limit);
    const commands = await this.database.query<any>('SELECT id, command_type, status, created_at FROM geoventra.device_commands WHERE organisation_id=$1 AND device_id=$2 ORDER BY created_at DESC LIMIT $3', [organisationId, deviceId, limit]);
    const events = await this.database.query<any>('SELECT id, event, detail, occurred_at FROM geoventra.device_connection_events WHERE organisation_id=$1 AND device_id=$2 ORDER BY occurred_at DESC LIMIT $3', [organisationId, deviceId, limit]);
    const items = [
      ...alarms.map((a: any) => ({ kind: 'alarm', id: a.id, title: a.alarm_type, occurredAt: a.occurred_at, metadata: a.metadata })),
      ...commands.map((c: any) => ({ kind: 'command', id: c.id, title: c.command_type, status: c.status, occurredAt: c.created_at })),
      ...events.map((e: any) => ({ kind: 'connection', id: e.id, title: e.event, detail: e.detail, occurredAt: e.occurred_at })),
    ].sort((a: any, b: any) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()).slice(0, limit);
    return items;
  }

  private async createAssignmentHistory(organisationId: string, deviceId: string, vehicleId: string | null, action: string, reason: string | null | undefined, performedBy: string | null | undefined) {
    const performedBySafe = performedBy ?? null;
    await this.database.query(
      `INSERT INTO geoventra.device_assignment_history (organisation_id, device_id, vehicle_id, action, reason, performed_by) VALUES ($1, $2, $3, $4, $5, $6)`,
      [organisationId, deviceId, vehicleId, action, reason ?? null, performedBySafe],
    ).catch(() => undefined);
    try { await (this.adminService as any).createAuditLog?.(organisationId, performedBySafe, `DEVICE_${action.toUpperCase()}`, 'device', deviceId, { vehicleId }); } catch {}
  }
}
