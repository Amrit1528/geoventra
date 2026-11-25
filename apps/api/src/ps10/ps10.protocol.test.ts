import { describe, expect, it } from 'vitest';
import { crc16itu } from '../pt06/pt06.protocol.js';
import {
  parsePackets,
  decodeLogin,
  decodeLocation,
  decodeHeartbeat,
  decodeAlarm,
  decodeCommandResponse,
  buildAck,
  buildLoginAck,
  buildHeartbeatAck,
  buildAlarmAck,
  buildCommand,
  isValidCoordinate,
} from './ps10.protocol.js';

/** Build a GT06/PS10 frame with a valid CRC-ITU for the tests below. */
function frame(protocol: number, info: Buffer, serial = 0x1234, wide = false): Buffer {
  const lengthBytes = wide ? 2 : 1;
  const length = 1 + info.length + 2 + 2; // protocol + info + serial + CRC
  const buf = Buffer.alloc(2 + lengthBytes + length + 2);
  let off = 0;
  buf[off++] = wide ? 0x79 : 0x78;
  buf[off++] = wide ? 0x79 : 0x78;
  if (wide) {
    buf.writeUInt16BE(length, off);
    off += 2;
  } else {
    buf[off++] = length;
  }
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

function loginInfo(): Buffer {
  // BCD terminal ID; the leading zero nibble is stripped to form a 15-digit IMEI.
  return Buffer.from('0356938035643809', 'hex');
}

function locationInfo(): Buffer {
  const info = Buffer.alloc(31);
  info[0] = 26; info[1] = 11; info[2] = 25; info[3] = 10; info[4] = 30; info[5] = 0;
  info[6] = 0x38; // 8 satellites, GPS info length 3
  info.writeUInt32BE(Math.round(28.5 * 1_800_000), 7);
  info.writeUInt32BE(Math.round(77.2 * 1_800_000), 11);
  info[15] = 45;
  info.writeUInt16BE(0x1000 | 0x0400 | 123, 16); // GPS fix, northern hemisphere, heading 123
  info.writeUInt16BE(404, 18);
  info[20] = 45;
  info.writeUInt16BE(1234, 21);
  info.writeUIntBE(0x0a0b0c, 22, 3);
  info[26] = 1; // ACC on
  info.writeUInt32BE(12_345, 27); // optional mileage, metres
  return info;
}

function alarmInfo(): Buffer {
  const base = locationInfo().subarray(0, 26);
  const lbs = Buffer.alloc(8);
  lbs.writeUInt16BE(404, 0);
  lbs[2] = 45;
  lbs.writeUInt16BE(0x1234, 3);
  lbs.writeUIntBE(0x0a0b0c, 5, 3);

  const info = Buffer.alloc(base.length + 1 + lbs.length + 5);
  base.copy(info, 0);
  let off = base.length;
  info[off++] = lbs.length;
  lbs.copy(info, off);
  off += lbs.length;
  info[off++] = 0xcf; // oil cut, alarm status 1, charging, ACC high, defence on
  info[off++] = 3;    // voltage level
  info[off++] = 28;   // GSM signal
  info.writeUInt16BE(0x0102, off); // alarm type 1, English
  return info;
}

describe('PS10 framing', () => {
  it('parses a valid frame and reports CRC/stop validity', () => {
    const raw = frame(0x12, locationInfo());
    const { packets, remaining } = parsePackets(raw);
    expect(packets).toHaveLength(1);
    expect(remaining).toHaveLength(0);
    expect(packets[0]).toMatchObject({
      header: 0x7878,
      protocol: 0x12,
      serial: 0x1234,
      crcValid: true,
      stopValid: true,
    });
    expect(packets[0]?.info).toHaveLength(31);
  });

  it('parses multiple frames, junk prefixes and trailing bytes', () => {
    const first = frame(0x01, loginInfo(), 1);
    const second = frame(0x13, Buffer.from([0x80, 3, 28, 0, 2]), 2);
    const { packets, remaining } = parsePackets(Buffer.concat([Buffer.from([0x00, 0xff]), first, second, Buffer.from([0x78])]));
    expect(packets.map((packet) => packet.protocol)).toEqual([0x01, 0x13]);
    expect(packets.every((packet) => packet.crcValid && packet.stopValid)).toBe(true);
    expect(remaining.toString('hex')).toBe('78');
  });

  it('supports the 0x7979 header with a two-byte length', () => {
    const { packets } = parsePackets(frame(0x01, loginInfo(), 7, true));
    expect(packets).toHaveLength(1);
    expect(packets[0]?.header).toBe(0x7979);
    expect(packets[0]?.crcValid).toBe(true);
  });

  it('waits for a fragmented frame instead of emitting a partial packet', () => {
    const raw = frame(0x12, locationInfo());
    const first = parsePackets(raw.subarray(0, 10));
    expect(first.packets).toHaveLength(0);
    expect(first.remaining).toEqual(raw.subarray(0, 10));

    const complete = parsePackets(Buffer.concat([first.remaining, raw.subarray(10)]));
    expect(complete.packets).toHaveLength(1);
    expect(complete.packets[0]?.crcValid).toBe(true);
  });

  it('flags a corrupted CRC without dropping the frame', () => {
    const raw = frame(0x12, locationInfo());
    raw[raw.length - 4] ^= 0xff; // corrupt the high CRC byte
    const { packets } = parsePackets(raw);
    expect(packets).toHaveLength(1);
    expect(packets[0]?.crcValid).toBe(false);
  });

  it('rejects an invalid stop sequence', () => {
    const raw = frame(0x12, locationInfo());
    raw[raw.length - 1] = 0x00;
    expect(parsePackets(raw).packets[0]?.stopValid).toBe(false);
  });
});

describe('PS10 decoders', () => {
  it('decodes the login IMEI', () => {
    expect(decodeLogin(frame(0x01, loginInfo())).imei).toBe('356938035643809');
  });

  it('decodes coordinates, speed, heading, ACC and mileage', () => {
    const decoded = decodeLocation(frame(0x12, locationInfo()));
    expect(decoded.timestamp.toISOString()).toBe('2026-11-25T10:30:00.000Z');
    expect(decoded.latitude).toBeCloseTo(28.5, 5);
    expect(decoded.longitude).toBeCloseTo(77.2, 5);
    expect(decoded.speed).toBe(45);
    expect(decoded.heading).toBe(123);
    expect(decoded.satelliteCount).toBe(8);
    expect(decoded.gpsFix).toBe(true);
    expect(decoded.accStatus).toBe(true);
    expect(decoded.north).toBe(true);
    expect(decoded.east).toBe(true);
    expect(decoded.mileage).toBe(12_345);
    expect(isValidCoordinate(decoded.latitude, decoded.longitude)).toBe(true);
  });

  it('applies southern/western hemispheres and derives ACC from course bits when no ACC byte exists', () => {
    const info = locationInfo().subarray(0, 26);
    const course = 0x1000 | 0x0800 | 0x4000 | 0x8000 | 90; // fix, west, ACC valid + on
    info.writeUInt16BE(course, 16);
    const decoded = decodeLocation(frame(0x12, info));
    expect(decoded.latitude).toBeLessThan(0);
    expect(decoded.longitude).toBeLessThan(0);
    expect(decoded.heading).toBe(90);
    expect(decoded.accStatus).toBe(true);
    expect(decoded.mileage).toBeNull();
  });

  it('decodes heartbeat flags and language', () => {
    const info = Buffer.from([0xcf, 3, 28, 0, 2]);
    const decoded = decodeHeartbeat(frame(0x13, info));
    expect(decoded).toMatchObject({
      oilCut: true,
      gpsTracking: true,
      alarmStatus: 1,
      chargeOn: true,
      accHigh: true,
      defenseOn: true,
      voltageLevel: 3,
      gsmSignal: 28,
      alarmType: 0,
      language: 'en',
    });
  });

  it('decodes alarm status after the LBS block and prefers LBS cell info', () => {
    const decoded = decodeAlarm(frame(0x16, alarmInfo()));
    expect(decoded.latitude).toBeCloseTo(28.5, 5);
    expect(decoded.lbsLength).toBe(8);
    expect(decoded.lac).toBe(0x1234);
    expect(decoded.cellId).toBe(0x0a0b0c);
    expect(decoded.alarmStatus).toBe(1);
    expect(decoded.alarmType).toBe(1);
    expect(decoded.language).toBe('en');
    expect(decoded.chargeOn).toBe(true);
    expect(decoded.mileage).toBeNull();
  });

  it('throws on truncated information fields', () => {
    expect(() => decodeLocation(frame(0x12, Buffer.from([1, 2, 3])))).toThrow(/truncated/);
    expect(() => decodeAlarm(frame(0x16, locationInfo().subarray(0, 27)))).toThrow(/truncated/);
  });
});

describe('PS10 builders', () => {
  it('builds valid acknowledgement frames', () => {
    for (const ack of [buildLoginAck(9), buildHeartbeatAck(9), buildAlarmAck(9), buildAlarmAck(9, 0x26)]) {
      const packet = parsePackets(ack).packets[0];
      expect(packet?.crcValid).toBe(true);
      expect(packet?.stopValid).toBe(true);
      expect(packet?.serial).toBe(9);
      expect(buildAck(packet!.protocol, 9)).toEqual(ack);
    }
  });

  it('builds server commands that round-trip through parsePackets', () => {
    const command = buildCommand(0x01020304, 'RELAY,1', 0x1234);
    const packet = parsePackets(command).packets[0];
    expect(packet?.protocol).toBe(0x80);
    expect(packet?.crcValid).toBe(true);
    expect(packet?.stopValid).toBe(true);
    expect(packet?.length).toBe(1 + 1 + 4 + 7 + 2 + 2);

    const info = Buffer.alloc(1 + 4 + 7 + 2);
    info[0] = 11;
    info.writeUInt32BE(0x01020304, 1);
    info.write('RELAY,1', 5, 'ascii');
    info.writeUInt16BE(0x0002, 12);
    const decoded = decodeCommandResponse(frame(0x15, info, 0x1234));
    expect(decoded).toMatchObject({ serverFlag: 0x01020304, command: 'RELAY,1', language: 2, serial: 0x1234 });
  });
});
