// @ts-nocheck
/** GEOVENTRA — PT06 protocol (Protocol 2022.4.27 V2) helpers.
 *
 *  Pure functions: CRC-ITU, packet framing, decoding, acknowledgements.
 *  No I/O. Safe to unit test in isolation.
 */

export interface RawPacket {
  header: number;       // 0x7878 or 0x7979
  length: number;       // packet length field value
  protocol: number;     // protocol number
  info: Buffer;         // information content
  serial: number;       // information serial number
  crc: number;          // received CRC
  crcValid: boolean;
  stopValid: boolean;
  raw: Buffer;
}

export interface LoginDecoded {
  imei: string;
  modelIdentifier: number;
  timeZoneLanguage: number;
  language: string;
}

export interface GpsDecoded {
  timestamp: Date;
  satelliteCount: number;
  gpsInfoLength: number;
  latitude: number;
  longitude: number;
  speed: number;
  heading: number;
  gpsFix: boolean;
  differential: boolean;
  north: boolean;
  east: boolean;
  mcc: number;
  mnc: number;
  lac: number;
  cellId: number;
  accStatus: boolean;
  dataReportingMode: number;
  gpsRetransmission: number; // 0 real-time, 1 retransmission
  mileageMeters: number | null;
}

export interface HeartbeatDecoded {
  terminalInfo: number;
  oilCut: boolean;
  gpsFix: boolean;
  terminalAlarm: number; // 0 normal,1 vibration,2 power cut,3 low battery,4 sos
  charging: boolean;
  accHigh: boolean;
  defenseOn: boolean;
  voltageLevel: number;
  gsmSignal: number;
  languageExt: number;
  externalVoltage: number | null;
  language: string;
}

export interface AlarmDecoded extends GpsDecoded {
  lbsLength: number;
  terminalInfo: number;
  oilCut: boolean;
  gpsFix: boolean;
  terminalAlarm: number;
  charging: boolean;
  accHigh: boolean;
  defenseOn: boolean;
  voltageLevel: number;
  gsmSignal: number;
  alarmLanguage: number;
  alarmType: number; // byte 1 alarm type
  language: string;
}

// ── CRC-ITU (from appendix A) ────────────────────────────────────────────────
const CRC_TABLE: number[] = [
  0x0000, 0x1189, 0x2312, 0x329b, 0x4624, 0x57ad, 0x6536, 0x74bf,
  0x8c48, 0x9dc1, 0xaf5a, 0xbed3, 0xca6c, 0xdbe5, 0xe97e, 0xf8f7,
  0x1081, 0x0108, 0x3393, 0x221a, 0x56a5, 0x472c, 0x75b7, 0x643e,
  0x9cc9, 0x8d40, 0xbfdb, 0xae52, 0xdaed, 0xcb64, 0xf9ff, 0xe876,
  0x2102, 0x308b, 0x0210, 0x1399, 0x6726, 0x76af, 0x4434, 0x55bd,
  0xad4a, 0xbcc3, 0x8e58, 0x9fd1, 0xeb6e, 0xfae7, 0xc87c, 0xd9f5,
  0x3183, 0x200a, 0x1291, 0x0318, 0x77a7, 0x662e, 0x54b5, 0x453c,
  0xbdc9, 0xac42, 0x9ed9, 0x8f50, 0xfbef, 0xea66, 0xd8fd, 0xc974,
  0x4204, 0x538d, 0x6116, 0x709f, 0x0420, 0x15a9, 0x2732, 0x36bb,
  0xce4c, 0xdfc5, 0xed5e, 0xfcd7, 0x8868, 0x99e1, 0xab7a, 0xbaf3,
  0x5285, 0x430c, 0x7197, 0x601e, 0x14a1, 0x0528, 0x37b3, 0x263a,
  0xdecd, 0xcf44, 0xfddf, 0xec56, 0x98e9, 0x8960, 0xbbfb, 0xaa72,
  0x6306, 0x728f, 0x4014, 0x519d, 0x2522, 0x34ab, 0x0630, 0x17b9,
  0xef4e, 0xfec7, 0xcc5c, 0xddd5, 0xa96a, 0xb8e3, 0x8a78, 0x9bf1,
  0x7387, 0x620e, 0x5095, 0x411c, 0x35a3, 0x242a, 0x16b1, 0x0738,
  0xffcf, 0xee46, 0xdcdd, 0xcd54, 0xb9eb, 0xa862, 0x9af9, 0x8b70,
  0x8408, 0x9581, 0xa71a, 0xb693, 0xc22c, 0xd3a5, 0xe13e, 0xf0b7,
  0x0840, 0x19c9, 0x2b52, 0x3adb, 0x4e64, 0x5fed, 0x6d76, 0x7cff,
  0x9489, 0x8500, 0xb79b, 0xa612, 0xd2ad, 0xc324, 0xf1bf, 0xe036,
  0x18c1, 0x0948, 0x3bd3, 0x2a5a, 0x5ee5, 0x4f6c, 0x7df7, 0x6c7e,
  0xa50a, 0xb483, 0x8618, 0x9791, 0xe32e, 0xf2a7, 0xc03c, 0xd1b5,
  0x2942, 0x38cb, 0x0a50, 0x1bd9, 0x6f66, 0x7eef, 0x4c74, 0x5dfd,
  0xb58b, 0xa402, 0x9699, 0x8710, 0xf3af, 0xe226, 0xd0bd, 0xc134,
  0x39c3, 0x284a, 0x1ad1, 0x0b58, 0x7fe7, 0x6e6e, 0x5cf5, 0x4d7c,
  0xc60c, 0xd785, 0xe51e, 0xf497, 0x8028, 0x91a1, 0xa33a, 0xb2b3,
  0x4a44, 0x5bcd, 0x6956, 0x78df, 0x0c60, 0x1de9, 0x2f72, 0x3efb,
  0xd68d, 0xc704, 0xf59f, 0xe416, 0x90a9, 0x8120, 0xb3bb, 0xa232,
  0x5ac5, 0x4b4c, 0x79d7, 0x685e, 0x1ce1, 0x0d68, 0x3ff3, 0x2e7a,
  0xe70e, 0xf687, 0xc41c, 0xd595, 0xa12a, 0xb0a3, 0x8238, 0x93b1,
  0x6b46, 0x7acf, 0x4854, 0x59dd, 0x2d62, 0x3ceb, 0x0e70, 0x1ff9,
  0xf78f, 0xe606, 0xd49d, 0xc514, 0xb1ab, 0xa022, 0x92b9, 0x8330,
  0x7bc7, 0x6a4e, 0x58d5, 0x495c, 0x3de3, 0x2c6a, 0x1ef1, 0x0f78,
];

export function crc16itu(data: Buffer | Uint8Array | number[]): number {
  let fcs = 0xffff;
  const bytes = data instanceof Buffer ? data : (Array.isArray(data) ? data : Array.from(data));
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i] & 0xff;
    fcs = (fcs >>> 8) ^ CRC_TABLE[(fcs ^ b) & 0xff];
  }
  return (~fcs) & 0xffff;
}

export const getCrc16 = crc16itu;
export const crcItu = crc16itu;

// ── Framing ───────────────────────────────────────────────────────────────────
export function parsePackets(buffer: Buffer): { packets: RawPacket[]; remaining: Buffer } {
  const packets: RawPacket[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    let header: number | null = null;
    let lenBytes = 0;
    if (buffer[offset] === 0x78 && offset + 1 < buffer.length && buffer[offset + 1] === 0x78) {
      header = 0x7878; lenBytes = 1;
    } else if (buffer[offset] === 0x79 && offset + 1 < buffer.length && buffer[offset + 1] === 0x79) {
      header = 0x7979; lenBytes = 2;
    } else {
      offset += 1;
      continue;
    }
    if (offset + 2 + lenBytes > buffer.length) break;
    const length = lenBytes === 1
      ? buffer[offset + 2]
      : buffer.readUInt16BE(offset + 2);
    if (length < 5 || length > 1024) {
      offset += 2;
      continue;
    }
    const total = 2 + lenBytes + length + 2;
    if (offset + total > buffer.length) break; // fragmented
    const raw = Buffer.from(buffer.subarray(offset, offset + total));
    const stopValid = raw[raw.length - 2] === 0x0d && raw[raw.length - 1] === 0x0a;
    const protocol = raw[2 + lenBytes];
    const infoLen = length - 5;
    const infoStart = 2 + lenBytes + 1;
    const info = Buffer.from(raw.subarray(infoStart, infoStart + infoLen));
    const serialOffset = infoStart + infoLen;
    const serial = raw.readUInt16BE(serialOffset);
    const crcOffset = serialOffset + 2;
    const crc = raw.readUInt16BE(crcOffset);
    const crcInput = raw.subarray(2, 2 + lenBytes + length - 2);
    const crcValid = crc16itu(crcInput) === crc;
    packets.push({ header, length, protocol, info, serial, crc, crcValid, stopValid, raw });
    offset += total;
  }
  return { packets, remaining: Buffer.from(buffer.subarray(offset)) };
}

export function parseFrames(buffer: Buffer) { return parsePackets(buffer); }

// ── Decoders ──────────────────────────────────────────────────────────────────
function toPacket(input: RawPacket | Buffer): RawPacket | null {
  if ((input as RawPacket).raw) return input as RawPacket;
  const buf = input as Buffer;
  const { packets } = parsePackets(buf);
  return packets[0] ?? null;
}

function terminalInfoFlags(ti: number) {
  return {
    oilCut: !!(ti & 0x80),
    gpsFix: !!(ti & 0x40),
    terminalAlarm: (ti >> 3) & 0x07,
    charging: !!(ti & 0x04),
    accHigh: !!(ti & 0x02),
    defenseOn: !!(ti & 0x01),
  };
}

function languageFromByte(b: number): string {
  if (b === 0x01) return 'zh';
  if (b === 0x02) return 'en';
  return 'unknown';
}

export function decodeLogin(input: RawPacket | Buffer): LoginDecoded {
  const packet = toPacket(input);
  const info = packet ? packet.info : (input as Buffer);
  const imeiBytes = info.subarray(0, 8);
  let hex = imeiBytes.toString('hex');
  if (hex.length === 16 && hex.startsWith('0')) hex = hex.slice(1);
  const modelIdentifier = info.readUInt16BE(8);
  const timeZoneLanguage = info.readUInt16BE(10);
  // language: lower bits
  const langByte = timeZoneLanguage & 0x0f;
  return {
    imei: hex,
    modelIdentifier,
    timeZoneLanguage,
    language: languageFromByte(langByte === 1 || langByte === 2 ? langByte : (timeZoneLanguage & 0x00ff) === 1 ? 1 : (timeZoneLanguage & 0x00ff) === 2 ? 2 : 0),
  };
}

export function decodeLoginPacket(input: RawPacket | Buffer) { return decodeLogin(input); }

function parseGpsInfo(info: Buffer, offsetStart = 0) {
  // returns { decoded, consumed } but we parse fixed layout
  const o = offsetStart;
  const year = info[o];
  const month = info[o + 1];
  const day = info[o + 2];
  const hour = info[o + 3];
  const minute = info[o + 4];
  const second = info[o + 5];
  const timestamp = new Date(Date.UTC(2000 + year, month - 1, day, hour, minute, second));
  const gpsInfo = info[o + 6];
  const satelliteCount = gpsInfo & 0x0f;
  const gpsInfoLength = (gpsInfo >> 4) & 0x0f;
  const latRaw = info.readUInt32BE(o + 7);
  const lngRaw = info.readUInt32BE(o + 11);
  const speed = info[o + 15];
  const courseStatus = info.readUInt16BE(o + 16);
  const differential = !!(courseStatus & 0x2000);
  const gpsFix = !!(courseStatus & 0x1000);
  const east = !(courseStatus & 0x0800);
  const north = !!(courseStatus & 0x0400);
  const heading = courseStatus & 0x03ff;
  const latitude = (north ? 1 : -1) * (latRaw / 1800000);
  const longitude = (east ? 1 : -1) * (lngRaw / 1800000);
  const mcc = info.readUInt16BE(o + 18);
  const mnc = info[o + 20];
  const lac = info.readUInt16BE(o + 21);
  const cellId = (info[o + 23] << 16) | (info[o + 24] << 8) | info[o + 25];
  const accStatus = info[o + 26] === 1;
  const dataReportingMode = info[o + 27];
  const gpsRetransmission = info[o + 28];
  return {
    timestamp, satelliteCount, gpsInfoLength, latitude, longitude, speed, heading,
    gpsFix, differential, north, east, mcc, mnc, lac, cellId, accStatus,
    dataReportingMode, gpsRetransmission,
  };
}

export function decodeGps(input: RawPacket | Buffer): GpsDecoded {
  const packet = toPacket(input);
  const info = packet ? packet.info : (input as Buffer);
  const base = parseGpsInfo(info, 0);
  // mileage optional: if info length >= 33 (29 base + 4)
  let mileageMeters: number | null = null;
  if (info.length >= 33) {
    mileageMeters = info.readUInt32BE(29);
  }
  return { ...base, mileageMeters };
}

export function decodeGpsPacket(input: RawPacket | Buffer) { return decodeGps(input); }

export function decodeHeartbeat(input: RawPacket | Buffer): HeartbeatDecoded {
  const packet = toPacket(input);
  const info = packet ? packet.info : (input as Buffer);
  const terminalInfo = info[0];
  const voltageLevel = info[1];
  const gsmSignal = info[2];
  const languageExt = info.readUInt16BE(3);
  const flags = terminalInfoFlags(terminalInfo);
  // external voltage
  let externalVoltage: number | null = null;
  if ((voltageLevel & 0xf0) === 0xf0) {
    const combined = ((voltageLevel & 0x0f) << 8) | ((languageExt >> 8) & 0xff);
    externalVoltage = combined / 10;
  }
  const langByte = languageExt & 0x00ff;
  return {
    terminalInfo,
    oilCut: flags.oilCut,
    gpsFix: flags.gpsFix,
    terminalAlarm: flags.terminalAlarm,
    charging: flags.charging,
    accHigh: flags.accHigh,
    defenseOn: flags.defenseOn,
    voltageLevel,
    gsmSignal,
    languageExt,
    externalVoltage,
    language: languageFromByte(langByte === 1 || langByte === 2 ? langByte : 0),
  };
}

export function decodeHeartbeatPacket(input: RawPacket | Buffer) { return decodeHeartbeat(input); }

export function decodeAlarm(input: RawPacket | Buffer): AlarmDecoded {
  const packet = toPacket(input);
  const info = packet ? packet.info : (input as Buffer);
  // parse gps base from start
  const base = parseGpsInfo(info, 0);
  // lbs
  const lbsLength = info[18];
  const lbsStart = 19;
  const lbs = info.subarray(lbsStart, lbsStart + lbsLength);
  let mcc = base.mcc, mnc = base.mnc, lac = base.lac, cellId = base.cellId;
  if (lbs.length >= 8) {
    mcc = lbs.readUInt16BE(0);
    mnc = lbs[2];
    lac = lbs.readUInt16BE(3);
    cellId = (lbs[5] << 16) | (lbs[6] << 8) | lbs[7];
  }
  const o = lbsStart + lbsLength;
  const terminalInfo = info[o];
  const voltageLevel = info[o + 1];
  const gsmSignal = info[o + 2];
  const alarmLanguage = info.readUInt16BE(o + 3);
  const flags = terminalInfoFlags(terminalInfo);
  const alarmType = (alarmLanguage >> 8) & 0xff;
  const langByte = alarmLanguage & 0x00ff;
  // external voltage optional
  let externalVoltage: number | null = null;
  if ((voltageLevel & 0xf0) === 0xf0) {
    const combined = ((voltageLevel & 0x0f) << 8) | ((alarmLanguage >> 8) & 0xff);
    externalVoltage = combined / 10;
  }
  return {
    ...base,
    mcc, mnc, lac, cellId,
    mileageMeters: null,
    lbsLength,
    terminalInfo,
    oilCut: flags.oilCut,
    gpsFix: flags.gpsFix || base.gpsFix,
    terminalAlarm: flags.terminalAlarm,
    charging: flags.charging,
    accHigh: flags.accHigh,
    defenseOn: flags.defenseOn,
    voltageLevel,
    gsmSignal,
    alarmLanguage,
    alarmType,
    language: languageFromByte(langByte === 1 || langByte === 2 ? langByte : 0),
  };
}

export function decodeAlarmPacket(input: RawPacket | Buffer) { return decodeAlarm(input); }

// ── Ack builders ──────────────────────────────────────────────────────────────
export function buildAck(protocol: number, serial: number, header: number = 0x7878): Buffer {
  const buf = Buffer.alloc(10);
  buf[0] = 0x78; buf[1] = 0x78;
  buf[2] = 0x05;
  buf[3] = protocol;
  buf.writeUInt16BE(serial, 4);
  const crc = crc16itu(buf.subarray(2, 6));
  buf.writeUInt16BE(crc, 6);
  buf[8] = 0x0d; buf[9] = 0x0a;
  return buf;
}

export function buildLoginAck(serial: number) { return buildAck(0x01, serial); }
export function buildHeartbeatAck(serial: number) { return buildAck(0x13, serial); }
export function buildAlarmAck(serial: number) { return buildAck(0x26, serial); }

// ── Validation ────────────────────────────────────────────────────────────────
export function isValidCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function rawToDegrees(raw: number): number {
  return raw / 1800000;
}

// aliases
export const parseFramesAlias = parsePackets;
export const decodePacket = parsePackets;
export const convertCoordinate = rawToDegrees;
export const decodeCoordinate = rawToDegrees;
export const toDegrees = rawToDegrees;
export const crc16 = crc16itu;
export const crc = crc16itu;
export const validateCrc = (p: RawPacket) => p.crcValid;
