/** GEOVENTRA — PS10 TCP server and connection lifecycle. */

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createServer, type Server, type Socket } from 'node:net';
import type { NormalizedGpsEvent } from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { TrackingService } from '../tracking/tracking.service.js';
import {
  parsePackets,
  decodeLogin,
  decodeLocation,
  decodeHeartbeat,
  decodeAlarm,
  decodeCommandResponse,
  buildLoginAck,
  buildHeartbeatAck,
  buildAlarmAck,
  isValidCoordinate,
  type RawPacket,
} from './ps10.protocol.js';

interface ConnectionState {
  socket: Socket;
  remoteAddress: string;
  buffer: Buffer;
  imei: string | null;
  deviceUuid: string | null;
  deviceSerial: string | null;
  organisationId: string | null;
  registered: boolean;
  authenticated: boolean;
  offlineMarked: boolean;
  connectedAt: Date;
  lastSeenAt: Date;
  packetCount: number;
  rateWindowStart: number;
  rateCount: number;
  lastError: string | null;
}

const ALARM_MAP: Record<number, { type: string; severity: string }> = {
  1: { type: 'sos', severity: 'critical' },
  2: { type: 'low_battery', severity: 'medium' },
  3: { type: 'power_cut', severity: 'high' },
  4: { type: 'shock', severity: 'medium' },
};

function maskImei(imei: string | null): string {
  if (!imei) return '****';
  if (imei.length <= 8) return imei.slice(0, 2) + '****';
  return imei.slice(0, 4) + '****' + imei.slice(-4);
}

@Injectable()
export class Ps10Service implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(Ps10Service.name);
  private server: Server | null = null;
  private readonly connections = new Map<Socket, ConnectionState>();
  private readonly recentPackets: Array<Record<string, unknown>> = [];
  private readonly MAX_RECENT = 200;
  private port = 0;
  private started = false;
  private readonly maxConnections = Number(process.env.PS10_MAX_CONNECTIONS ?? process.env.PT06_MAX_CONNECTIONS ?? 200);
  private readonly rateLimitPerMinute = Number(process.env.PS10_RATE_LIMIT_PER_MINUTE ?? 120);
  private readonly timeoutMs = Number(process.env.PS10_TCP_TIMEOUT_MS ?? 180_000);

  constructor(
    private readonly db: DatabaseService,
    private readonly tracking: TrackingService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.start();
    } catch (err) {
      this.logger.warn(`PS10 TCP server failed to start; continuing without it: ${(err as Error)?.message ?? err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private resolvePort(): number {
    const candidates = [process.env.PS10_TCP_PORT, process.env.PS10_PORT, process.env.PICTOR_TCP_PORT];
    for (const candidate of candidates) {
      if (candidate) {
        const port = Number(candidate);
        if (Number.isFinite(port) && port > 0) return port;
      }
    }
    return Number(process.env.PS10_DEFAULT_TCP_PORT ?? 5002);
  }

  private resolveHost(): string {
    return process.env.PS10_TCP_HOST ?? process.env.TCP_HOST ?? '0.0.0.0';
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.port = this.resolvePort();
    const host = this.resolveHost();
    const pt06Port = Number(process.env.PT06_TCP_PORT ?? process.env.PT06_PORT ?? process.env.PT06_DEFAULT_TCP_PORT ?? 5001);
    if (this.port === pt06Port) {
      this.logger.warn(`PS10 and PT06 are configured for the same TCP port (${this.port}); PS10 will not bind`);
      return;
    }

    this.server = createServer((socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.logger.error(`PS10 TCP server error: ${err.message}`);
        reject(err);
      };
      this.server!.once('error', onError);
      this.server!.listen(this.port, host, () => {
        this.server!.off('error', onError);
        this.server!.on('error', (err) => this.logger.error(`PS10 TCP server error: ${err.message}`));
        this.started = true;
        this.logger.log(`PS10 TCP server listening on ${host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const socket of this.connections.keys()) {
      try { socket.destroy(); } catch { /* ignore */ }
    }
    this.connections.clear();
    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
    this.started = false;
  }

  getStatus(): Record<string, unknown> {
    return {
      started: this.started,
      port: this.port,
      host: this.resolveHost(),
      connections: this.connections.size,
      maxConnections: this.maxConnections,
      recentPackets: this.recentPackets.length,
    };
  }

  getConnections(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const state of this.connections.values()) {
      out.push({
        remoteAddress: state.remoteAddress,
        imei: maskImei(state.imei),
        deviceSerial: state.deviceSerial,
        registered: state.registered,
        authenticated: state.authenticated,
        connectedAt: state.connectedAt.toISOString(),
        lastSeenAt: state.lastSeenAt.toISOString(),
        packetCount: state.packetCount,
        lastError: state.lastError,
      });
    }
    return out;
  }

  getRecentPackets(limit = 50): Array<Record<string, unknown>> {
    const n = Math.max(1, Math.min(Number(limit) || 50, this.MAX_RECENT));
    return this.recentPackets.slice(-n);
  }

  private handleConnection(socket: Socket): void {
    if (this.connections.size >= this.maxConnections) {
      socket.destroy();
      return;
    }
    const state: ConnectionState = {
      socket,
      remoteAddress: socket.remoteAddress ?? 'unknown',
      buffer: Buffer.alloc(0),
      imei: null,
      deviceUuid: null,
      deviceSerial: null,
      organisationId: null,
      registered: false,
      authenticated: false,
      offlineMarked: false,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
      packetCount: 0,
      rateWindowStart: Date.now(),
      rateCount: 0,
      lastError: null,
    };
    this.connections.set(socket, state);
    socket.setTimeout(this.timeoutMs, () => {
      state.lastError = 'timeout';
      socket.destroy();
    });
    socket.on('data', (chunk: Buffer) => this.handleData(state, chunk));
    socket.on('close', () => {
      void this.markOffline(state, 'disconnected');
      this.connections.delete(socket);
    });
    socket.on('error', (err) => {
      state.lastError = err.message;
      this.logger.warn(`PS10 socket error ${maskImei(state.imei)}: ${err.message}`);
    });
  }

  private handleData(state: ConnectionState, chunk: Buffer): void {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    state.lastSeenAt = new Date();
    const now = Date.now();
    if (now - state.rateWindowStart > 60_000) {
      state.rateWindowStart = now;
      state.rateCount = 0;
    }

    let guard = 0;
    while (state.buffer.length > 0 && guard < 50) {
      guard++;
      const { packets, remaining } = parsePackets(state.buffer);
      if (packets.length === 0) {
        // No complete packet yet; keep the partial frame unless it is junk.
        if (state.buffer.length > 4096) state.buffer = state.buffer.subarray(state.buffer.length - 1024);
        break;
      }
      state.buffer = remaining;
      for (const packet of packets) {
        state.rateCount++;
        if (state.rateCount > this.rateLimitPerMinute) {
          state.lastError = 'rate_limited';
          state.socket.destroy();
          return;
        }
        void this.handlePacket(state, packet).catch((err: Error) => {
          state.lastError = err.message;
          this.logger.warn(`PS10 packet handling error: ${err.message}`);
        });
      }
    }
  }

  private async handlePacket(state: ConnectionState, packet: RawPacket): Promise<void> {
    state.packetCount++;
    this.recentPackets.push({
      at: new Date().toISOString(),
      remoteAddress: state.remoteAddress,
      imei: maskImei(state.imei),
      protocol: packet.protocol,
      serial: packet.serial,
      crcValid: packet.crcValid,
      stopValid: packet.stopValid,
      length: packet.length,
    });
    if (this.recentPackets.length > this.MAX_RECENT) this.recentPackets.shift();

    if (!packet.crcValid || !packet.stopValid) {
      await this.logAudit(state, packet, 'invalid', 'crc_or_stop_invalid');
      state.lastError = 'invalid_packet';
      return;
    }

    switch (packet.protocol) {
      case 0x01: await this.handleLogin(state, packet); break;
      case 0x12: await this.handleLocation(state, packet); break;
      case 0x13: await this.handleHeartbeat(state, packet); break;
      case 0x16: // some PS10 firmware versions use 0x26 for alarms
      case 0x26: await this.handleAlarm(state, packet); break;
      case 0x15: await this.handleCommandResponse(state, packet); break;
      default: await this.logAudit(state, packet, 'rejected', `unsupported_protocol_${packet.protocol}`);
    }
  }

  private async handleLogin(state: ConnectionState, packet: RawPacket): Promise<void> {
    let imei: string;
    try {
      imei = decodeLogin(packet).imei;
    } catch (err) {
      state.lastError = (err as Error).message;
      await this.logAudit(state, packet, 'invalid', 'invalid_login');
      return;
    }
    state.imei = imei;
    state.socket.write(buildLoginAck(packet.serial));

    const device = await this.db.queryOne<{
      id: string;
      device_id: string;
      organisation_id: string;
      active_flag: boolean;
    }>(
      `SELECT id, device_id, organisation_id, active_flag FROM geoventra.devices
       WHERE imei = $1 ORDER BY created_at DESC LIMIT 1`,
      [imei],
    );

    if (!device) {
      state.registered = false;
      state.authenticated = false;
      await this.logAudit(state, packet, 'unauthorized', 'unregistered_imei');
      return;
    }
    if (!device.active_flag) {
      state.registered = false;
      state.authenticated = false;
      await this.logAudit(state, packet, 'rejected', 'inactive_device');
      return;
    }

    state.deviceUuid = device.id;
    state.deviceSerial = device.device_id;
    state.organisationId = device.organisation_id;
    state.registered = true;
    state.authenticated = true;
    state.lastError = null;
    await this.upsertConnectionStatus(device.id, device.organisation_id, 'online');
    await this.db.query(
      `UPDATE geoventra.devices SET status='online', last_communication_at=now() WHERE id=$1`,
      [device.id],
    );
    await this.db.query(
      `INSERT INTO geoventra.device_connection_events (organisation_id, device_id, event, detail)
       VALUES ($1,$2,'connected',$3)`,
      [device.organisation_id, device.id, `PS10 login IMEI ${maskImei(imei)}`],
    );
    await this.logAudit(state, packet, 'accepted', null);
  }

  private async handleLocation(state: ConnectionState, packet: RawPacket): Promise<void> {
    let decoded;
    try {
      decoded = decodeLocation(packet);
    } catch (err) {
      state.lastError = (err as Error).message;
      await this.logAudit(state, packet, 'invalid', 'invalid_location');
      return;
    }
    if (!isValidCoordinate(decoded.latitude, decoded.longitude)) {
      state.lastError = 'invalid_coordinates';
      await this.logAudit(state, packet, 'invalid', 'invalid_coordinates');
      return;
    }
    if (!this.isRegistered(state)) {
      await this.logAudit(state, packet, 'unauthorized', 'unregistered_imei');
      return;
    }

    const deviceUuid = state.deviceUuid!;
    const orgId = state.organisationId!;
    const deviceSerial = state.deviceSerial!;
    await this.db.query(`UPDATE geoventra.devices SET status='online', last_communication_at=now() WHERE id=$1`, [deviceUuid]);
    await this.upsertConnectionStatus(deviceUuid, orgId, 'online');

    const event: NormalizedGpsEvent = {
      deviceId: deviceSerial,
      vehicleId: '',
      latitude: decoded.latitude,
      longitude: decoded.longitude,
      speedKph: decoded.speed,
      heading: decoded.heading,
      ignition: decoded.accStatus,
      batteryVoltage: null,
      accuracyM: null,
      gpsSignal: decoded.gpsFix ? (decoded.satelliteCount >= 4 ? 'ok' : 'weak') : 'none',
      satelliteCount: decoded.satelliteCount,
      odometerKm: decoded.mileage,
      engineHours: null,
      recordedAt: decoded.timestamp.toISOString(),
    };
    try {
      const result = await this.tracking.ingest([event]);
      await this.logAudit(state, packet, result.accepted > 0 ? 'accepted' : 'rejected', result.accepted > 0 ? null : 'not_assigned_or_invalid');
    } catch (err) {
      state.lastError = (err as Error).message;
      await this.logAudit(state, packet, 'rejected', (err as Error).message);
    }
  }

  private async handleHeartbeat(state: ConnectionState, packet: RawPacket): Promise<void> {
    let decoded;
    try {
      decoded = decodeHeartbeat(packet);
    } catch (err) {
      state.lastError = (err as Error).message;
      await this.logAudit(state, packet, 'invalid', 'invalid_heartbeat');
      return;
    }
    state.socket.write(buildHeartbeatAck(packet.serial));
    if (!this.isRegistered(state)) {
      await this.logAudit(state, packet, 'unauthorized', 'unregistered_imei');
      return;
    }

    const deviceUuid = state.deviceUuid!;
    const orgId = state.organisationId!;
    await this.db.query(`UPDATE geoventra.devices SET status='online', last_communication_at=now() WHERE id=$1`, [deviceUuid]);
    await this.upsertConnectionStatus(deviceUuid, orgId, 'online');
    await this.db.query(
      `UPDATE geoventra.device_connection_status
       SET messages_last_hour = messages_last_hour + 1, last_message_at=now(), updated_at=now()
       WHERE device_id=$1`,
      [deviceUuid],
    );
    // The protocol reports a 0..6 voltage level, not a calibrated voltage.
    // Only store the signal strength; do not invent a battery voltage.
    await this.db.query(
      `INSERT INTO geoventra.device_health (organisation_id, device_id, signal_strength, network_status)
       VALUES ($1,$2,$3,'online')`,
      [orgId, deviceUuid, decoded.gsmSignal],
    );
    await this.logAudit(state, packet, 'accepted', null);
  }

  private async handleAlarm(state: ConnectionState, packet: RawPacket): Promise<void> {
    let decoded;
    try {
      decoded = decodeAlarm(packet);
    } catch (err) {
      state.lastError = (err as Error).message;
      await this.logAudit(state, packet, 'invalid', 'invalid_alarm');
      return;
    }
    state.socket.write(buildAlarmAck(packet.serial, packet.protocol));
    if (!isValidCoordinate(decoded.latitude, decoded.longitude)) {
      await this.logAudit(state, packet, 'invalid', 'invalid_coordinates');
      return;
    }
    if (!this.isRegistered(state)) {
      await this.logAudit(state, packet, 'unauthorized', 'unregistered_imei');
      return;
    }

    const deviceUuid = state.deviceUuid!;
    const orgId = state.organisationId!;
    const deviceSerial = state.deviceSerial!;
    const alarm = ALARM_MAP[decoded.alarmStatus]
      ?? (decoded.alarmType ? { type: `alarm_${decoded.alarmType}`, severity: 'medium' } : { type: 'alarm', severity: 'medium' });

    await this.db.query(`UPDATE geoventra.devices SET status='online', last_communication_at=now() WHERE id=$1`, [deviceUuid]);
    await this.upsertConnectionStatus(deviceUuid, orgId, 'online');

    // Device-level alarm history (independent of vehicle assignment).
    await this.db.query(
      `INSERT INTO geoventra.device_alarms
        (organisation_id, device_id, alarm_type, severity, message, occurred_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
      [
        orgId, deviceUuid, alarm.type, alarm.severity,
        `PS10 alarm from ${maskImei(state.imei)}`, decoded.timestamp,
        JSON.stringify({ protocol: `0x${packet.protocol.toString(16)}`, alarmType: decoded.alarmType, terminalInfo: decoded.terminalInfo }),
      ],
    ).catch((err: Error) => this.logger.warn(`PS10 alarm history insert failed: ${err.message}`));

    try {
      const binding = await this.tracking.resolveVehicle(deviceSerial);
      if (binding) {
        const dedupeKey = `ps10:${alarm.type}:${binding.vehicleId}:${Math.floor(Date.now() / 3_600_000)}`;
        await this.db.query(
          `INSERT INTO geoventra.alerts
            (organisation_id, vehicle_id, type, severity, status, title, message, latitude, longitude, occurred_at, dedupe_key)
           SELECT $1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10
            WHERE NOT EXISTS (
              SELECT 1 FROM geoventra.alerts WHERE dedupe_key=$10 AND status IN ('open','acknowledged')
            )
           ON CONFLICT DO NOTHING`,
          [
            orgId, binding.vehicleId, alarm.type, alarm.severity,
            `PS10 ${alarm.type} alarm`, `PS10 device ${maskImei(state.imei)} reported ${alarm.type}`,
            decoded.latitude, decoded.longitude, decoded.timestamp, dedupeKey,
          ],
        );
      }
    } catch (err) {
      this.logger.warn(`PS10 alert creation failed: ${(err as Error).message}`);
    }

    const event: NormalizedGpsEvent = {
      deviceId: deviceSerial,
      vehicleId: '',
      latitude: decoded.latitude,
      longitude: decoded.longitude,
      speedKph: decoded.speed,
      heading: decoded.heading,
      ignition: decoded.accStatus,
      batteryVoltage: null,
      accuracyM: null,
      gpsSignal: decoded.gpsFix ? (decoded.satelliteCount >= 4 ? 'ok' : 'weak') : 'none',
      satelliteCount: decoded.satelliteCount,
      odometerKm: decoded.mileage,
      engineHours: null,
      recordedAt: decoded.timestamp.toISOString(),
    };
    try {
      await this.tracking.ingest([event]);
    } catch (err) {
      this.logger.warn(`PS10 alarm location ingest failed: ${(err as Error).message}`);
    }
    await this.logAudit(state, packet, 'accepted', null);
  }

  private async handleCommandResponse(state: ConnectionState, packet: RawPacket): Promise<void> {
    let decoded;
    try {
      decoded = decodeCommandResponse(packet);
    } catch (err) {
      state.lastError = (err as Error).message;
      await this.logAudit(state, packet, 'invalid', 'invalid_command_response');
      return;
    }
    this.logger.log(`PS10 command response ${maskImei(state.imei)}: ${decoded.command}`);

    if (this.isRegistered(state)) {
      try {
        const command = await this.db.queryOne<{ id: string }>(
          `SELECT id FROM geoventra.device_commands
           WHERE organisation_id=$1 AND device_id=$2 AND status IN ('pending','sent')
             AND (correlation_id=$3 OR payload->>'serverFlag'=$3)
           ORDER BY created_at DESC LIMIT 1`,
          [state.organisationId, state.deviceUuid, String(decoded.serverFlag)],
        );
        if (command) {
          await this.db.query(
            `INSERT INTO geoventra.device_command_acks (organisation_id, command_id, device_id, payload)
             VALUES ($1,$2,$3,$4::jsonb)`,
            [state.organisationId, command.id, state.deviceUuid, JSON.stringify({
              command: decoded.command,
              serverFlag: decoded.serverFlag,
              language: decoded.language,
              serial: decoded.serial,
              source: 'ps10',
            })],
          );
          await this.db.query(
            `UPDATE geoventra.device_commands
             SET status='acknowledged', acknowledged_at=now(), updated_at=now()
             WHERE organisation_id=$1 AND id=$2`,
            [state.organisationId, command.id],
          );
        }
      } catch (err) {
        this.logger.warn(`PS10 command acknowledgement failed: ${(err as Error).message}`);
      }
    }
    await this.logAudit(state, packet, 'accepted', 'command_response');
  }

  private isRegistered(state: ConnectionState): boolean {
    return state.registered && !!state.deviceUuid && !!state.organisationId && !!state.deviceSerial;
  }

  private async markOffline(state: ConnectionState, reason: string): Promise<void> {
    if (!state.deviceUuid || !state.organisationId || state.offlineMarked) return;
    state.offlineMarked = true;
    await this.db.query(`UPDATE geoventra.devices SET status='offline', last_communication_at=now() WHERE id=$1`, [state.deviceUuid]).catch(() => undefined);
    await this.upsertConnectionStatus(state.deviceUuid, state.organisationId, 'offline').catch(() => undefined);
    await this.db.query(
      `INSERT INTO geoventra.device_connection_events (organisation_id, device_id, event, detail)
       VALUES ($1,$2,'disconnected',$3)`,
      [state.organisationId, state.deviceUuid, reason],
    ).catch(() => undefined);
  }

  private async upsertConnectionStatus(deviceId: string, orgId: string, status: string): Promise<void> {
    await this.db.query(
      `INSERT INTO geoventra.device_connection_status (device_id, organisation_id, state, last_message_at, updated_at)
       VALUES ($1,$2,$3,now(),now())
       ON CONFLICT (device_id) DO UPDATE SET state=EXCLUDED.state, last_message_at=now(), updated_at=now()`,
      [deviceId, orgId, status],
    );
  }

  private async logAudit(state: ConnectionState, packet: RawPacket, outcome: string, reason: string | null): Promise<void> {
    await this.db.query(
      `INSERT INTO geoventra.device_ingestion_audit
        (organisation_id, device_id, message_id, source, outcome, reason, payload_bytes, received_at)
       VALUES ($1,$2,$3,'tcp',$4,$5,$6,now())`,
      [state.organisationId, state.deviceUuid, String(packet.serial ?? ''), outcome, reason, packet.raw.length],
    ).catch(() => undefined);
  }
}
