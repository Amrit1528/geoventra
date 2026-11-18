/** GEOVENTRA — PT06 TCP server and connection lifecycle. */

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { createServer, type Server, type Socket } from 'node:net';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { TrackingService } from '../tracking/tracking.service.js';
import { AlertService } from '../alerts/alert.service.js';
import {
  parsePackets,
  decodeLogin,
  decodeGps,
  decodeHeartbeat,
  decodeAlarm,
  buildLoginAck,
  buildHeartbeatAck,
  buildAlarmAck,
  isValidCoordinate,
  crc16itu,
} from './pt06.protocol.js';

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
  connectedAt: Date;
  lastSeenAt: Date;
  packetCount: number;
  rateWindowStart: number;
  rateCount: number;
  lastError: string | null;
}

const ALARM_MAP: Record<number, { type: string; severity: string }> = {
  0x01: { type: 'sos', severity: 'critical' },
  0x02: { type: 'power_cut', severity: 'high' },
  0x03: { type: 'vibration', severity: 'medium' },
  0x04: { type: 'geofence_entry', severity: 'low' },
  0x05: { type: 'geofence_exit', severity: 'low' },
  0x06: { type: 'overspeed', severity: 'high' },
  0x09: { type: 'movement', severity: 'medium' },
  0x0e: { type: 'low_battery', severity: 'medium' },
  0x0f: { type: 'low_battery', severity: 'medium' },
  0x11: { type: 'power_off', severity: 'high' },
  0x13: { type: 'demolition', severity: 'critical' },
  0x14: { type: 'door', severity: 'low' },
};

function maskImei(imei: string | null): string {
  if (!imei) return '****';
  if (imei.length <= 8) return imei.slice(0, 2) + '****';
  return imei.slice(0, 4) + '****' + imei.slice(-4);
}

@Injectable()
export class Pt06Service implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(Pt06Service.name);
  private server: Server | null = null;
  private readonly connections = new Map<Socket, ConnectionState>();
  private readonly recentPackets: Array<Record<string, unknown>> = [];
  private readonly MAX_RECENT = 200;
  private port = 0;
  private started = false;
  private readonly maxConnections = Number(process.env.PT06_MAX_CONNECTIONS ?? 200);
  private readonly rateLimitPerMinute = Number(process.env.PT06_RATE_LIMIT_PER_MINUTE ?? 120);
  private readonly timeoutMs = Number(process.env.PT06_TCP_TIMEOUT_MS ?? 180_000);

  constructor(
    private readonly db: DatabaseService,
    private readonly tracking: TrackingService,
    private readonly alerts: AlertService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.start();
    } catch (err) {
      this.logger.warn(`PT06 TCP server failed to start; continuing without it: ${(err as Error)?.message ?? err}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  private resolvePort(): number {
    const candidates = [
      process.env.PT06_TCP_PORT,
      process.env.PT06_PORT,
      process.env.GPS_TCP_PORT,
      process.env.TRACKER_TCP_PORT,
      process.env.TCP_PORT,
    ];
    for (const c of candidates) {
      if (c) {
        const n = Number(c);
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return Number(process.env.PT06_DEFAULT_TCP_PORT ?? 5000);
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.port = this.resolvePort();
    const host = process.env.PT06_TCP_HOST ?? process.env.TCP_HOST ?? '0.0.0.0';
    this.server = createServer((socket) => this.handleConnection(socket));
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.logger.error(`PT06 TCP server error: ${err.message}`);
        reject(err);
      };
      this.server!.once('error', onError);
      this.server!.listen(this.port, host, () => {
        this.server!.off('error', onError);
        this.server!.on('error', (err) => this.logger.error(`PT06 TCP server error: ${err.message}`));
        this.started = true;
        this.logger.log(`PT06 TCP server listening on ${host}:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const sock of this.connections.keys()) {
      try { sock.destroy(); } catch { /* ignore */ }
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
      host: process.env.PT06_TCP_HOST ?? '0.0.0.0',
      connections: this.connections.size,
      maxConnections: this.maxConnections,
      recentPackets: this.recentPackets.length,
    };
  }

  getConnections(): Array<Record<string, unknown>> {
    const out: Array<Record<string, unknown>> = [];
    for (const c of this.connections.values()) {
      out.push({
        remoteAddress: c.remoteAddress,
        imei: maskImei(c.imei),
        deviceSerial: c.deviceSerial,
        registered: c.registered,
        authenticated: c.authenticated,
        connectedAt: c.connectedAt.toISOString(),
        lastSeenAt: c.lastSeenAt.toISOString(),
        packetCount: c.packetCount,
        lastError: c.lastError,
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
      this.markOffline(state, 'timeout');
      socket.destroy();
    });
    socket.on('data', (chunk: Buffer) => this.handleData(state, chunk));
    socket.on('close', () => {
      this.markOffline(state, 'disconnected');
      this.connections.delete(socket);
    });
    socket.on('error', (err) => {
      state.lastError = err.message;
      this.logger.warn(`PT06 socket error ${maskImei(state.imei)}: ${err.message}`);
    });
  }

  private handleData(state: ConnectionState, chunk: Buffer): void {
    state.buffer = Buffer.concat([state.buffer, chunk]);
    state.lastSeenAt = new Date();
    // rate limit
    const now = Date.now();
    if (now - state.rateWindowStart > 60_000) {
      state.rateWindowStart = now;
      state.rateCount = 0;
    }
    // parse packets
    let guard = 0;
    while (state.buffer.length > 0 && guard < 50) {
      guard++;
      const { packets, remaining } = parsePackets(state.buffer);
      if (packets.length === 0) {
        // no complete packet; keep remaining (could be partial)
        // if buffer too large, trim
        if (state.buffer.length > 4096) {
          state.buffer = state.buffer.subarray(state.buffer.length - 1024);
        }
        break;
      }
      state.buffer = remaining;
      for (const pkt of packets) {
        // rate limit per packet
        state.rateCount++;
        if (state.rateCount > this.rateLimitPerMinute) {
          state.lastError = 'rate_limited';
          state.socket.destroy();
          return;
        }
        this.handlePacket(state, pkt).catch((err) => {
          state.lastError = (err as Error).message;
          this.logger.warn(`PT06 packet handling error: ${(err as Error).message}`);
        });
      }
    }
  }

  private async handlePacket(state: ConnectionState, pkt: any): Promise<void> {
    state.packetCount++;
    // record recent
    this.recentPackets.push({
      at: new Date().toISOString(),
      remoteAddress: state.remoteAddress,
      imei: maskImei(state.imei),
      protocol: pkt.protocol,
      serial: pkt.serial,
      crcValid: pkt.crcValid,
      stopValid: pkt.stopValid,
      length: pkt.length,
    });
    if (this.recentPackets.length > this.MAX_RECENT) this.recentPackets.shift();

    if (!pkt.crcValid || !pkt.stopValid) {
      await this.logAudit(state, pkt, 'invalid', 'crc_or_stop_invalid');
      state.lastError = 'invalid_packet';
      return;
    }
    if (pkt.length < 5 || pkt.length > 1024) {
      await this.logAudit(state, pkt, 'invalid', 'bad_length');
      return;
    }

    switch (pkt.protocol) {
      case 0x01:
        await this.handleLogin(state, pkt);
        break;
      case 0x13:
        await this.handleHeartbeat(state, pkt);
        break;
      case 0x22:
        await this.handleGps(state, pkt);
        break;
      case 0x26:
        await this.handleAlarm(state, pkt);
        break;
      default:
        await this.logAudit(state, pkt, 'rejected', `unsupported_protocol_${pkt.protocol}`);
    }
  }

  private async handleLogin(state: ConnectionState, pkt: any): Promise<void> {
    const decoded = decodeLogin(pkt);
    state.imei = decoded.imei;
    // find device
    const device = await this.db.queryOne<any>(
      `SELECT id, device_id, organisation_id FROM geoventra.devices WHERE imei = $1 ORDER BY created_at DESC LIMIT 1`,
      [decoded.imei],
    );
    // ack regardless
    state.socket.write(buildLoginAck(pkt.serial));
    if (device) {
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
        [device.organisation_id, device.id, `PT06 login IMEI ${maskImei(decoded.imei)}`],
      );
      await this.logAudit(state, pkt, 'accepted', null);
    } else {
      state.registered = false;
      state.authenticated = false;
      await this.logAudit(state, pkt, 'unauthorized', 'unregistered_imei');
    }
  }

  private async handleHeartbeat(state: ConnectionState, pkt: any): Promise<void> {
    const decoded = decodeHeartbeat(pkt);
    // ack regardless
    state.socket.write(buildHeartbeatAck(pkt.serial));
    if (!state.registered || !state.deviceUuid || !state.organisationId) {
      await this.logAudit(state, pkt, 'unauthorized', 'unregistered_imei');
      return;
    }
    const deviceUuid = state.deviceUuid;
    const orgId = state.organisationId;
    await this.upsertConnectionStatus(deviceUuid, orgId, 'online', {
      lastHeartbeatAt: new Date(),
    });
    // update messages_last_hour increment
    await this.db.query(
      `UPDATE geoventra.device_connection_status
          SET messages_last_hour = messages_last_hour + 1,
              last_message_at = now(), last_heartbeat_at = now(),
              state='online', updated_at=now(),
              last_error = NULL
        WHERE device_id = $1`,
      [deviceUuid],
    );
    // device health metadata
    await this.db.query(
      `UPDATE geoventra.devices
          SET status='online', last_communication_at=now(),
              metadata = COALESCE(metadata,'{}'::jsonb) || $2::jsonb
        WHERE id = $1`,
      [deviceUuid, JSON.stringify({
        pt06: {
          voltageLevel: decoded.voltageLevel,
          externalVoltage: decoded.externalVoltage,
          gsmSignal: decoded.gsmSignal,
          accHigh: decoded.accHigh,
          charging: decoded.charging,
          defenseOn: decoded.defenseOn,
          terminalAlarm: decoded.terminalAlarm,
          lastHeartbeatAt: new Date().toISOString(),
        },
      })],
    );
    await this.logAudit(state, pkt, 'accepted', null);
  }

  private async handleGps(state: ConnectionState, pkt: any): Promise<void> {
    const decoded = decodeGps(pkt);
    if (!isValidCoordinate(decoded.latitude, decoded.longitude)) {
      await this.logAudit(state, pkt, 'invalid', 'invalid_coordinates');
      state.lastError = 'invalid_coordinates';
      return;
    }
    if (!state.registered || !state.deviceUuid || !state.organisationId || !state.deviceSerial) {
      await this.logAudit(state, pkt, 'unauthorized', 'unregistered_imei');
      return;
    }
    const deviceUuid = state.deviceUuid;
    const orgId = state.organisationId;
    const deviceSerial = state.deviceSerial;
    // update device comm
    await this.db.query(
      `UPDATE geoventra.devices SET status='online', last_communication_at=now() WHERE id=$1`,
      [deviceUuid],
    );
    await this.upsertConnectionStatus(deviceUuid, orgId, 'online');
    await this.db.query(
      `UPDATE geoventra.device_connection_status SET messages_last_hour = messages_last_hour + 1, last_message_at=now(), updated_at=now() WHERE device_id=$1`,
      [deviceUuid],
    );

    const ignition = decoded.accStatus;
    const gpsSignal = decoded.gpsFix
      ? (decoded.satelliteCount >= 4 ? 'ok' : 'weak')
      : 'none';
    const event = {
      deviceId: deviceSerial,
      vehicleId: '',
      latitude: decoded.latitude,
      longitude: decoded.longitude,
      speedKph: decoded.speed,
      heading: decoded.heading,
      ignition,
      batteryVoltage: null,
      accuracyM: null,
      gpsSignal: gpsSignal as 'ok' | 'weak' | 'none',
      satelliteCount: decoded.satelliteCount,
      odometerKm: decoded.mileageMeters !== null ? decoded.mileageMeters / 1000 : null,
      engineHours: null,
      recordedAt: decoded.timestamp.toISOString(),
    };
    try {
      const result = await this.tracking.ingest([event as any]);
      await this.logAudit(state, pkt, result.accepted > 0 ? 'accepted' : 'rejected',
        result.accepted > 0 ? null : 'not_assigned_or_invalid');
    } catch (err) {
      state.lastError = (err as Error).message;
      await this.logAudit(state, pkt, 'rejected', (err as Error).message);
    }
  }

  private async handleAlarm(state: ConnectionState, pkt: any): Promise<void> {
    const decoded = decodeAlarm(pkt);
    state.socket.write(buildAlarmAck(pkt.serial));
    if (!isValidCoordinate(decoded.latitude, decoded.longitude)) {
      await this.logAudit(state, pkt, 'invalid', 'invalid_coordinates');
      return;
    }
    if (!state.registered || !state.deviceUuid || !state.organisationId || !state.deviceSerial) {
      await this.logAudit(state, pkt, 'unauthorized', 'unregistered_imei');
      return;
    }
    const deviceUuid = state.deviceUuid;
    const orgId = state.organisationId;
    const deviceSerial = state.deviceSerial;
    await this.db.query(
      `UPDATE geoventra.devices SET status='online', last_communication_at=now() WHERE id=$1`,
      [deviceUuid],
    );
    // ingest location
    const ignition = decoded.accStatus;
    const gpsSignal = decoded.gpsFix ? 'ok' : 'none';
    const event = {
      deviceId: deviceSerial,
      vehicleId: '',
      latitude: decoded.latitude,
      longitude: decoded.longitude,
      speedKph: decoded.speed,
      heading: decoded.heading,
      ignition,
      batteryVoltage: null,
      accuracyM: null,
      gpsSignal,
      satelliteCount: decoded.satelliteCount,
      odometerKm: null,
      engineHours: null,
      recordedAt: decoded.timestamp.toISOString(),
    };
    try {
      await this.tracking.ingest([event as any]);
    } catch (err) {
      this.logger.warn(`PT06 alarm ingest failed: ${(err as Error).message}`);
    }

    // create alert if alarm type non-zero
    const alarmByte = decoded.alarmType;
    const terminalAlarm = decoded.terminalAlarm;
    let alertInfo: { type: string; severity: string } | null = ALARM_MAP[alarmByte] ?? null;
    if (!alertInfo && terminalAlarm > 0) {
      // terminal alarm bits: 1 vibration, 2 power cut, 3 low battery, 4 sos
      const map: Record<number, { type: string; severity: string }> = {
        1: { type: 'vibration', severity: 'medium' },
        2: { type: 'power_cut', severity: 'high' },
        3: { type: 'low_battery', severity: 'medium' },
        4: { type: 'sos', severity: 'critical' },
      };
      alertInfo = map[terminalAlarm] ?? null;
    }
    if (alertInfo) {
      const binding = await this.tracking.resolveVehicle(deviceSerial);
      if (binding) {
        const dedupeKey = `pt06:${alertInfo.type}:${binding.vehicleId}:${Math.floor(Date.now() / 3600000)}`;
        await this.db.query(
          `INSERT INTO geoventra.alerts
             (organisation_id, vehicle_id, type, severity, status, title, message,
              latitude, longitude, occurred_at, dedupe_key)
           SELECT $1,$2,$3,$4,'open',$5,$6,$7,$8,$9,$10
            WHERE NOT EXISTS (SELECT 1 FROM geoventra.alerts WHERE dedupe_key=$10 AND status IN ('open','acknowledged'))
           ON CONFLICT DO NOTHING`,
          [
            orgId,
            binding.vehicleId,
            alertInfo.type,
            alertInfo.severity,
            `PT06 ${alertInfo.type} alarm`,
            `PT06 device ${maskImei(state.imei)} reported ${alertInfo.type}`,
            decoded.latitude,
            decoded.longitude,
            decoded.timestamp,
            dedupeKey,
          ],
        );
      }
    }
    await this.logAudit(state, pkt, 'accepted', null);
  }

  private async upsertConnectionStatus(deviceId: string, orgId: string, state: string, extra?: { lastHeartbeatAt?: Date }): Promise<void> {
    await this.db.query(
      `INSERT INTO geoventra.device_connection_status (device_id, organisation_id, state, last_message_at, updated_at)
       VALUES ($1,$2,$3,now(),now())
       ON CONFLICT (device_id) DO UPDATE SET state=$3, last_message_at=now(), updated_at=now()`,
      [deviceId, orgId, state],
    );
    if (extra?.lastHeartbeatAt) {
      await this.db.query(
        `UPDATE geoventra.device_connection_status SET last_heartbeat_at=$2 WHERE device_id=$1`,
        [deviceId, extra.lastHeartbeatAt],
      );
    }
  }

  private async markOffline(state: ConnectionState, reason: string): Promise<void> {
    if (state.deviceUuid && state.organisationId) {
      try {
        await this.db.query(
          `UPDATE geoventra.device_connection_status SET state='offline', updated_at=now(), last_error=$2 WHERE device_id=$1`,
          [state.deviceUuid, reason],
        );
        await this.db.query(
          `UPDATE geoventra.devices SET status='offline' WHERE id=$1`,
          [state.deviceUuid],
        );
        await this.db.query(
          `INSERT INTO geoventra.device_connection_events (organisation_id, device_id, event, detail)
           VALUES ($1,$2,'disconnected',$3)`,
          [state.organisationId, state.deviceUuid, reason],
        );
      } catch (err) {
        this.logger.warn(`markOffline failed: ${(err as Error).message}`);
      }
    }
  }

  private async logAudit(state: ConnectionState, pkt: any, outcome: string, reason: string | null): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO geoventra.device_ingestion_audit
           (organisation_id, device_id, source, outcome, reason, payload_bytes, received_at)
         VALUES ($1,$2,'tcp',$3,$4,$5,now())`,
        [state.organisationId, state.deviceUuid, outcome, reason, pkt.raw?.length ?? 0],
      );
    } catch (err) {
      this.logger.warn(`audit log failed: ${(err as Error).message}`);
    }
  }
}
