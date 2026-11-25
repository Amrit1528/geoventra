/** GEOVENTRA — PS10 (Pictor) GPS tracker protocol helpers.
 *
 *  Pure functions: framing, decoding, acknowledgements and command builders.
 *  No I/O, so every function can be unit tested in isolation.
 *
 *  Framing is GT06-compatible: 0x7878 (1-byte length) or 0x7979 (2-byte
 *  length) start, a length field counting protocol + information + serial +
 *  CRC, and a 0x0d0a stop sequence. The CRC is CRC-ITU over length..serial.
 *
 *  Field offsets in the information section follow the documented GT06
 *  layout: 26 bytes of GPS data, optional ACC byte, optional 4-byte mileage.
 *  Alarm packets append an LBS block before the terminal status fields.
 *  Where a protocol variant omits the separate ACC byte, ACC is derived from
 *  the extended course/status bits instead.
 */
import { crc16itu } from '../pt06/pt06.protocol.js';

export interface RawPacket {
  header: number; // 0x7878 or 0x7979
  length: number; // value of the length field
  protocol: number;
  info: Buffer; // information content (excludes protocol, serial and CRC)
  serial: number;
  crc: number;
  crcValid: boolean;
  stopValid: boolean;
  raw: Buffer;
}

export interface LoginDecoded {
  imei: string;
}

export interface LocationFields {
  timestamp: Date;
  satelliteCount: number;
  gpsInfoLength: number;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  gpsFix: boolean;
  differential: boolean;
  accStatus: boolean;
  north: boolean;
  east: boolean;
  mcc: number;
  mnc: number;
  lac: number;
  cellId: number;
}

export interface LocationDecoded extends LocationFields {
  mileage: number | null;
}

export interface HeartbeatDecoded {
  terminalInfo: number;
  oilCut: boolean;
  gpsTracking: boolean;
  alarmStatus: number;
  chargeOn: boolean;
  accHigh: boolean;
  defenseOn: boolean;
  voltageLevel: number;
  gsmSignal: number;
  alarmType: number;
  language: string;
}

export interface AlarmDecoded extends LocationDecoded {
  terminalInfo: number;
  oilCut: boolean;
  gpsTracking: boolean;
  alarmStatus: number;
  chargeOn: boolean;
  accHigh: boolean;
  defenseOn: boolean;
  voltageLevel: number;
  gsmSignal: number;
  alarmType: number;
  language: string;
  lbsLength: number;
}

export interface CommandResponseDecoded {
  lenCmd: number;
  serverFlag: number;
  command: string;
  language: number;
  serial: number;
}

const GPS_INFO_BYTES = 26;
const DEGREES_FACTOR = 1_800_000; // 30000 * 60 — GT06 coordinate scale
const MAX_LENGTH = 1024;

function byteAt(buffer: Buffer, offset: number): number {
  return offset >= 0 && offset < buffer.length ? buffer[offset] ?? 0 : 0;
}

function requireLength(buffer: Buffer, offset: number, label: string): void {
  if (offset > buffer.length) throw new Error(`PS10: truncated ${label}`);
}

// ── Framing ───────────────────────────────────────────────────────────────────
export function parsePackets(buffer: Buffer): { packets: RawPacket[]; remaining: Buffer } {
  const packets: RawPacket[] = [];
  let offset = 0;

  while (offset < buffer.length) {
    const first = byteAt(buffer, offset);
    const second = byteAt(buffer, offset + 1);
    if ((first === 0x78 || first === 0x79) && offset + 1 >= buffer.length) {
      break; // the second header byte may arrive in the next chunk
    }
    let header: number;
    let lengthBytes: number;

    if (first === 0x78 && second === 0x78) {
      header = 0x7878;
      lengthBytes = 1;
    } else if (first === 0x79 && second === 0x79) {
      header = 0x7979;
      lengthBytes = 2;
    } else {
      offset += 1; // resynchronise on the next possible header
      continue;
    }

    if (offset + 2 + lengthBytes > buffer.length) break; // header split across chunks
    const length = lengthBytes === 1
      ? byteAt(buffer, offset + 2)
      : buffer.readUInt16BE(offset + 2);

    if (length < 5 || length > MAX_LENGTH) {
      offset += 2; // implausible length — keep scanning
      continue;
    }

    const total = 2 + lengthBytes + length + 2;
    if (offset + total > buffer.length) break; // incomplete packet, keep in buffer

    const raw = Buffer.from(buffer.subarray(offset, offset + total));
    const protocolOffset = 2 + lengthBytes;
    const protocol = byteAt(raw, protocolOffset);
    const infoStart = protocolOffset + 1;
    const infoLength = length - 5;
    const info = Buffer.from(raw.subarray(infoStart, infoStart + infoLength));
    const serialOffset = infoStart + infoLength;
    const serial = raw.readUInt16BE(serialOffset);
    const crc = raw.readUInt16BE(serialOffset + 2);
    const crcInput = raw.subarray(2, 2 + lengthBytes + length - 2);
    const crcValid = crc16itu(crcInput) === crc;
    const stopValid = byteAt(raw, raw.length - 2) === 0x0d && byteAt(raw, raw.length - 1) === 0x0a;

    packets.push({ header, length, protocol, info, serial, crc, crcValid, stopValid, raw });
    offset += total;
  }

  return { packets, remaining: Buffer.from(buffer.subarray(offset)) };
}

function toPacket(input: RawPacket | Buffer): RawPacket {
  if (Buffer.isBuffer(input)) {
    const packet = parsePackets(input).packets[0];
    if (!packet) throw new Error('PS10: no complete packet in buffer');
    return packet;
  }
  if (!input?.raw) throw new Error('PS10: invalid packet');
  return input;
}

function bcdImei(bytes: Buffer): string {
  const hex = bytes.toString('hex').replace(/^0+/, '');
  return (hex || '0').slice(0, 15);
}

// ── Decoders ──────────────────────────────────────────────────────────────────
export function decodeLogin(input: RawPacket | Buffer): LoginDecoded {
  const { info } = toPacket(input);
  return { imei: bcdImei(info.subarray(0, 8)) };
}

function parseDateTime(info: Buffer, offset: number): Date {
  requireLength(info, offset + 6, 'timestamp');
  const year = byteAt(info, offset);
  const month = byteAt(info, offset + 1);
  const day = byteAt(info, offset + 2);
  const hour = byteAt(info, offset + 3);
  const minute = byteAt(info, offset + 4);
  const second = byteAt(info, offset + 5);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
    throw new Error('PS10: invalid timestamp');
  }
  return new Date(Date.UTC(2000 + year, month - 1, day, hour, minute, second));
}

interface CourseStatus {
  heading: number;
  north: boolean;
  west: boolean;
  gpsFix: boolean;
  differential: boolean;
  statusBitA: boolean;
  statusBitB: boolean;
}

function parseCourseStatus(courseStatus: number): CourseStatus {
  return {
    heading: courseStatus & 0x03ff,
    north: (courseStatus & 0x0400) !== 0,
    west: (courseStatus & 0x0800) !== 0,
    gpsFix: (courseStatus & 0x1000) !== 0,
    differential: (courseStatus & 0x2000) !== 0,
    statusBitA: (courseStatus & 0x4000) !== 0,
    statusBitB: (courseStatus & 0x8000) !== 0,
  };
}

/** ACC is a dedicated byte in the standard layout; variants without it encode
 *  ACC in the top two course/status bits (valid + on). */
function accStatus(info: Buffer, cs: CourseStatus): boolean {
  if (info.length > GPS_INFO_BYTES) return byteAt(info, GPS_INFO_BYTES) === 1;
  return cs.statusBitA && cs.statusBitB;
}

function parseLocationFields(info: Buffer): LocationFields {
  requireLength(info, GPS_INFO_BYTES, 'location');
  let off = 0;
  const timestamp = parseDateTime(info, off);
  off += 6;
  const gpsInfo = byteAt(info, off++);
  const satelliteCount = gpsInfo & 0x0f;
  const gpsInfoLength = (gpsInfo >> 4) & 0x0f;
  const latRaw = info.readUInt32BE(off);
  off += 4;
  const lngRaw = info.readUInt32BE(off);
  off += 4;
  const speed = byteAt(info, off++);
  const cs = parseCourseStatus(info.readUInt16BE(off));
  off += 2;
  const latitude = (cs.north ? 1 : -1) * latRaw / DEGREES_FACTOR;
  const longitude = (cs.west ? -1 : 1) * lngRaw / DEGREES_FACTOR;
  const mcc = info.readUInt16BE(off);
  off += 2;
  const mnc = byteAt(info, off++);
  const lac = info.readUInt16BE(off);
  off += 2;
  const cellId = (byteAt(info, off) << 16) | (byteAt(info, off + 1) << 8) | byteAt(info, off + 2);

  return {
    timestamp,
    satelliteCount,
    gpsInfoLength,
    latitude,
    longitude,
    speed,
    heading: cs.heading,
    gpsFix: cs.gpsFix,
    differential: cs.differential,
    accStatus: accStatus(info, cs),
    north: cs.north,
    east: !cs.west,
    mcc,
    mnc,
    lac,
    cellId,
  };
}

export function decodeLocation(input: RawPacket | Buffer): LocationDecoded {
  const { info } = toPacket(input);
  const base = parseLocationFields(info);
  const mileage = info.length >= GPS_INFO_BYTES + 5 ? info.readUInt32BE(GPS_INFO_BYTES + 1) : null;
  return { ...base, mileage };
}

function terminalFlags(terminalInfo: number) {
  return {
    oilCut: (terminalInfo & 0x80) !== 0,
    gpsTracking: (terminalInfo & 0x40) !== 0,
    alarmStatus: (terminalInfo >> 3) & 0x07,
    chargeOn: (terminalInfo & 0x04) !== 0,
    accHigh: (terminalInfo & 0x02) !== 0,
    defenseOn: (terminalInfo & 0x01) !== 0,
  };
}

function languageFromByte(value: number): string {
  if (value === 0x01) return 'zh';
  if (value === 0x02) return 'en';
  return 'unknown';
}

export function decodeHeartbeat(input: RawPacket | Buffer): HeartbeatDecoded {
  const { info } = toPacket(input);
  requireLength(info, 1, 'heartbeat');
  const terminalInfo = byteAt(info, 0);
  const alarmLanguage = info.length >= 5 ? info.readUInt16BE(3) : 0x0002;
  return {
    terminalInfo,
    ...terminalFlags(terminalInfo),
    voltageLevel: byteAt(info, 1),
    gsmSignal: byteAt(info, 2),
    alarmType: (alarmLanguage >> 8) & 0xff,
    language: languageFromByte(alarmLanguage & 0xff),
  };
}

export function decodeAlarm(input: RawPacket | Buffer): AlarmDecoded {
  const { info } = toPacket(input);
  const base = parseLocationFields(info);
  requireLength(info, GPS_INFO_BYTES + 1, 'alarm LBS length');

  const lbsLength = byteAt(info, GPS_INFO_BYTES);
  const lbsStart = GPS_INFO_BYTES + 1;
  const statusOffset = lbsStart + lbsLength;
  requireLength(info, statusOffset + 5, 'alarm status');

  let { mcc, mnc, lac, cellId } = base;
  if (lbsLength >= 8) {
    mcc = info.readUInt16BE(lbsStart);
    mnc = byteAt(info, lbsStart + 2);
    lac = info.readUInt16BE(lbsStart + 3);
    cellId = (byteAt(info, lbsStart + 5) << 16) | (byteAt(info, lbsStart + 6) << 8) | byteAt(info, lbsStart + 7);
  }

  const terminalInfo = byteAt(info, statusOffset);
  const alarmLanguage = info.readUInt16BE(statusOffset + 3);
  return {
    ...base,
    mcc,
    mnc,
    lac,
    cellId,
    mileage: null,
    lbsLength,
    terminalInfo,
    ...terminalFlags(terminalInfo),
    voltageLevel: byteAt(info, statusOffset + 1),
    gsmSignal: byteAt(info, statusOffset + 2),
    alarmType: (alarmLanguage >> 8) & 0xff,
    language: languageFromByte(alarmLanguage & 0xff),
  };
}

export function decodeCommandResponse(input: RawPacket | Buffer): CommandResponseDecoded {
  const packet = toPacket(input);
  const { info } = packet;
  requireLength(info, 1, 'command response');
  const lenCmd = byteAt(info, 0);
  requireLength(info, 5, 'command response server flag');
  requireLength(info, 1 + lenCmd + 2, 'command response');
  return {
    lenCmd,
    serverFlag: info.readUInt32BE(1),
    command: info.subarray(5, 1 + lenCmd).toString('ascii'),
    language: info.readUInt16BE(1 + lenCmd),
    serial: packet.serial,
  };
}

// ── Builders ──────────────────────────────────────────────────────────────────
export function buildAck(protocol: number, serial: number): Buffer {
  const buf = Buffer.alloc(10);
  buf[0] = 0x78;
  buf[1] = 0x78;
  buf[2] = 0x05;
  buf[3] = protocol & 0xff;
  buf.writeUInt16BE(serial & 0xffff, 4);
  buf.writeUInt16BE(crc16itu(buf.subarray(2, 6)), 6);
  buf[8] = 0x0d;
  buf[9] = 0x0a;
  return buf;
}

export function buildLoginAck(serial: number): Buffer {
  return buildAck(0x01, serial);
}

export function buildHeartbeatAck(serial: number): Buffer {
  return buildAck(0x13, serial);
}

/** Echo the alarm protocol number received (0x16 or 0x26 depending on model). */
export function buildAlarmAck(serial: number, protocol = 0x16): Buffer {
  return buildAck(protocol, serial);
}

/** Server command: 0x7878 | length | 0x80 | len | flag(4) | command | serial | CRC | 0x0d0a. */
export function buildCommand(serverFlag: number, command: string, serial: number): Buffer {
  const cmdBuf = Buffer.from(command, 'ascii');
  const length = 1 + (1 + 4 + cmdBuf.length) + 2 + 2; // protocol + info + serial + CRC
  const buf = Buffer.alloc(2 + 1 + length + 2);
  let off = 0;
  buf[off++] = 0x78;
  buf[off++] = 0x78;
  buf[off++] = length;
  buf[off++] = 0x80;
  buf[off++] = 4 + cmdBuf.length;
  buf.writeUInt32BE(serverFlag >>> 0, off);
  off += 4;
  cmdBuf.copy(buf, off);
  off += cmdBuf.length;
  buf.writeUInt16BE(serial & 0xffff, off);
  off += 2;
  buf.writeUInt16BE(crc16itu(buf.subarray(2, off)), off);
  off += 2;
  buf[off++] = 0x0d;
  buf[off] = 0x0a;
  return buf;
}

// ── Validation ────────────────────────────────────────────────────────────────
export function isValidCoordinate(latitude: number, longitude: number): boolean {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90
    && longitude >= -180 && longitude <= 180;
}

export const parseFrames = parsePackets;
