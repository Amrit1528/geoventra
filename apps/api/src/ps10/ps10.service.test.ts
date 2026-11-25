import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Socket } from 'node:net';
import { crc16itu } from '../pt06/pt06.protocol.js';
import { parsePackets } from './ps10.protocol.js';
import { Ps10Service } from './ps10.service.js';

function frame(protocol: number, info: Buffer, serial = 1): Buffer {
  const length = 1 + info.length + 2 + 2;
  const buf = Buffer.alloc(2 + 1 + length + 2);
  let off = 0;
  buf[off++] = 0x78;
  buf[off++] = 0x78;
  buf[off++] = length;
  buf[off++] = protocol;
  info.copy(buf, off);
  off += info.length;
  buf.writeUInt16BE(serial, off);
  off += 2;
  buf.writeUInt16BE(crc16itu(buf.subarray(2, off)), off);
  off += 2;
  buf[off++] = 0x0d;
  buf[off++] = 0x0a;
  return buf;
}

function packetFor(protocol: number, info: Buffer, serial = 1) {
  const packet = parsePackets(frame(protocol, info, serial)).packets[0];
  if (!packet) throw new Error('test fixture produced an invalid frame');
  return packet;
}

function locationInfo(): Buffer {
  const info = Buffer.alloc(31);
  info[0] = 26; info[1] = 11; info[2] = 25; info[3] = 10; info[4] = 30; info[5] = 0;
  info[6] = 0x38;
  info.writeUInt32BE(Math.round(28.5 * 1_800_000), 7);
  info.writeUInt32BE(Math.round(77.2 * 1_800_000), 11);
  info[15] = 45;
  info.writeUInt16BE(0x1400 | 123, 16); // GPS fix + north
  info.writeUInt16BE(404, 18);
  info[20] = 45;
  info.writeUInt16BE(1234, 21);
  info.writeUIntBE(0x0a0b0c, 22, 3);
  info[26] = 1;
  info.writeUInt32BE(12_345, 27);
  return info;
}

function alarmInfo(): Buffer {
  const base = locationInfo().subarray(0, 26);
  const info = Buffer.alloc(base.length + 1 + 8 + 5);
  base.copy(info, 0);
  let off = base.length;
  info[off++] = 8;
  info.writeUInt16BE(404, off);
  info[off + 2] = 45;
  info.writeUInt16BE(0x1234, off + 3);
  off += 8;
  info[off++] = 0xcf;
  info[off++] = 3;
  info[off++] = 28;
  info.writeUInt16BE(0x0102, off);
  return info;
}

const device = { id: 'dev-1', device_id: 'DEV001', organisation_id: 'org-1', active_flag: true };

describe('PS10 service wiring', () => {
  let db: { query: ReturnType<typeof vi.fn>; queryOne: ReturnType<typeof vi.fn> };
  let tracking: { ingest: ReturnType<typeof vi.fn>; resolveVehicle: ReturnType<typeof vi.fn> };
  let service: Ps10Service;

  beforeEach(() => {
    db = {
      query: vi.fn().mockResolvedValue([]),
      queryOne: vi.fn().mockResolvedValue(device),
    };
    tracking = {
      ingest: vi.fn().mockResolvedValue({ accepted: 1, rejected: 0 }),
      resolveVehicle: vi.fn().mockResolvedValue({ vehicleId: 'veh-1' }),
    };
    service = new Ps10Service(db as never, tracking as never);
  });

  function state(registered = false) {
    const socket = { write: vi.fn(), destroy: vi.fn() };
    return {
      state: {
        socket: socket as unknown as Socket,
        remoteAddress: '127.0.0.1',
        buffer: Buffer.alloc(0),
        imei: null,
        deviceUuid: registered ? device.id : null,
        deviceSerial: registered ? device.device_id : null,
        organisationId: registered ? device.organisation_id : null,
        registered,
        authenticated: registered,
        offlineMarked: false,
        connectedAt: new Date(),
        lastSeenAt: new Date(),
        packetCount: 0,
        rateWindowStart: Date.now(),
        rateCount: 0,
        lastError: null,
      },
      socket,
    };
  }

  const handle = (svc: Ps10Service, connection: ReturnType<typeof state>, protocol: number, info: Buffer) =>
    (svc as unknown as {
      handlePacket(connectionState: unknown, packet: unknown): Promise<void>;
    }).handlePacket(connection.state, packetFor(protocol, info));

  it('acknowledges a login, registers the device and marks it online', async () => {
    const connection = state();
    await handle(service, connection, 0x01, Buffer.from('0356938035643809', 'hex'));

    expect(connection.socket.write).toHaveBeenCalledTimes(1);
    expect(connection.state).toMatchObject({
      imei: '356938035643809',
      registered: true,
      deviceUuid: 'dev-1',
      organisationId: 'org-1',
    });
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringContaining('FROM geoventra.devices'), ['356938035643809']);
    expect(db.query.mock.calls.some(([sql]: [string]) => sql.includes("status='online'"))).toBe(true);
    expect(db.query.mock.calls.some(([sql]: [string]) => sql.includes('device_ingestion_audit'))).toBe(true);
  });

  it('does not ingest telemetry from an unregistered connection', async () => {
    const connection = state();
    await handle(service, connection, 0x12, locationInfo());

    expect(tracking.ingest).not.toHaveBeenCalled();
    expect(db.query.mock.calls.some(([, params]: [string, unknown[]]) => params?.includes('unregistered_imei'))).toBe(true);
  });

  it('ingests a location for a registered device', async () => {
    const connection = state(true);
    await handle(service, connection, 0x12, locationInfo());

    expect(tracking.ingest).toHaveBeenCalledTimes(1);
    const event = tracking.ingest.mock.calls[0]?.[0][0];
    expect(event).toMatchObject({ deviceId: 'DEV001', speedKph: 45, ignition: true, odometerKm: 12_345 });
    expect(db.query.mock.calls.some(([sql]: [string]) => sql.includes('device_connection_status'))).toBe(true);
  });

  it('stores alarms, raises a vehicle alert and ingests the alarm location', async () => {
    const connection = state(true);
    await handle(service, connection, 0x16, alarmInfo());

    expect(connection.socket.write).toHaveBeenCalledTimes(1);
    expect(db.query.mock.calls.some(([sql]: [string]) => sql.includes('geoventra.device_alarms'))).toBe(true);
    expect(db.query.mock.calls.some(([sql]: [string]) => sql.includes('geoventra.alerts'))).toBe(true);
    expect(tracking.ingest).toHaveBeenCalledTimes(1);
  });

  it('acknowledges a server command matched by server flag', async () => {
    db.queryOne.mockImplementation(async (sql: string) =>
      sql.includes('device_commands')
        ? { id: 'cmd-1' }
        : device,
    );
    const connection = state(true);
    const info = Buffer.alloc(14);
    info[0] = 11; // 4-byte flag + 7-byte command
    info.writeUInt32BE(0x01020304, 1);
    info.write('RELAY,1', 5, 'ascii');
    info.writeUInt16BE(2, 12);

    await handle(service, connection, 0x15, info);

    expect(db.query.mock.calls.some(([sql]: [string]) => sql.includes('geoventra.device_command_acks'))).toBe(true);
    expect(db.query.mock.calls.some(([sql]: [string]) => sql.includes("status='acknowledged'"))).toBe(true);
  });
});
