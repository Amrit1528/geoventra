/**
 * GEOVENTRA — deterministic demo fleet.
 *
 * The simulator drives this fleet instead of talking to the database. Vehicle identity is
 * anchored on the tracker serial (`GVT-1000NN`) because that is what a physical device
 * reports; the API resolves a serial to a vehicle through `device_assignments`.
 *
 * The fleet is generated rather than hand-written so that it stays in lock-step with the
 * seeded database rows without duplicating 120 UUID literals into the repository.
 */

import type { VehicleCategory } from './domain.js';
import { CITY_CODES } from './geo.js';

export type DemoStatusBias = 'mostly_online' | 'balanced' | 'often_offline';

export interface DemoVehicle {
  /** Stable synthetic id. The API resolves the real vehicle through the device serial. */
  id: string;
  /** Tracker serial — the identity a physical device reports. */
  deviceId: string;
  index: number;
  registrationNumber: string;
  name: string;
  category: VehicleCategory;
  fuelType: string;
  city: string;
  cityCode: string;
  cityName: string;
  statusBias: DemoStatusBias;
  odometerStartKm: number;
  engineHoursStart: number;
  /** Where on the city loop the vehicle starts, 0–1. */
  startFraction: number;
}

interface CitySpec {
  name: string;
  code: string;
  /** Ten `[label, category, fuelType]` triples, one per vehicle in the city block. */
  vehicles: Array<[string, VehicleCategory, string]>;
  registrationPrefix: string;
}

const CITY_SPECS: CitySpec[] = [
  {
    name: 'Mumbai',
    code: 'BOM',
    registrationPrefix: 'MH 01',
    vehicles: [
      ['Field Car', 'car', 'petrol'],
      ['Delivery Van', 'van', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Transit Bus', 'bus', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Site Tipper', 'construction', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
    ],
  },
  {
    name: 'Pune',
    code: 'PNQ',
    registrationPrefix: 'MH 12',
    vehicles: [
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Field Car', 'car', 'petrol'],
      ['Service Motorcycle', 'motorcycle', 'petrol'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Farm Tractor', 'tractor', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Delivery Van', 'van', 'cng'],
    ],
  },
  {
    name: 'Bengaluru',
    code: 'BLR',
    registrationPrefix: 'KA 01',
    vehicles: [
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'hybrid'],
      ['Transit Bus', 'bus', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Site Tipper', 'construction', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
    ],
  },
  {
    name: 'Hyderabad',
    code: 'HYD',
    registrationPrefix: 'TS 09',
    vehicles: [
      ['Field Car', 'car', 'petrol'],
      ['Service Motorcycle', 'motorcycle', 'petrol'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Farm Tractor', 'tractor', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Delivery Van', 'van', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
    ],
  },
  {
    name: 'Delhi NCR',
    code: 'DEL',
    registrationPrefix: 'DL 1C',
    vehicles: [
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Transit Bus', 'bus', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Site Tipper', 'construction', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Service Motorcycle', 'motorcycle', 'petrol'],
    ],
  },
  {
    name: 'Chennai',
    code: 'MAA',
    registrationPrefix: 'TN 01',
    vehicles: [
      ['Freight Truck', 'truck', 'diesel'],
      ['Farm Tractor', 'tractor', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Delivery Van', 'van', 'cng'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'hybrid'],
    ],
  },
  {
    name: 'Ahmedabad',
    code: 'AMD',
    registrationPrefix: 'GJ 01',
    vehicles: [
      ['Transit Bus', 'bus', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Site Tipper', 'construction', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Service Motorcycle', 'motorcycle', 'petrol'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Farm Tractor', 'tractor', 'diesel'],
    ],
  },
  {
    name: 'Jaipur',
    code: 'JAI',
    registrationPrefix: 'RJ 14',
    vehicles: [
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Delivery Van', 'van', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Transit Bus', 'bus', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
    ],
  },
  {
    name: 'Kolkata',
    code: 'CCU',
    registrationPrefix: 'WB 02',
    vehicles: [
      ['Site Tipper', 'construction', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Field Car', 'car', 'petrol'],
      ['Service Motorcycle', 'motorcycle', 'petrol'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Farm Tractor', 'tractor', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
    ],
  },
  {
    name: 'Lucknow',
    code: 'LKO',
    registrationPrefix: 'UP 32',
    vehicles: [
      ['Field Car', 'car', 'petrol'],
      ['Delivery Van', 'van', 'cng'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'hybrid'],
      ['Transit Bus', 'bus', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Site Tipper', 'construction', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
    ],
  },
  {
    name: 'Surat',
    code: 'STI',
    registrationPrefix: 'GJ 05',
    vehicles: [
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Delivery Van', 'van', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Service Motorcycle', 'motorcycle', 'petrol'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
    ],
  },
  {
    name: 'Indore',
    code: 'IDR',
    registrationPrefix: 'MP 09',
    vehicles: [
      ['Freight Truck', 'truck', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Container Trailer', 'trailer_truck', 'diesel'],
      ['Field Car', 'car', 'petrol'],
      ['Transit Bus', 'bus', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
      ['Site Tipper', 'construction', 'diesel'],
      ['Freight Truck', 'truck', 'diesel'],
      ['Utility Pickup', 'pickup', 'diesel'],
      ['Delivery Van', 'van', 'cng'],
    ],
  },
];

/**
 * Derive a stable UUID-shaped identifier from a tracker serial.
 *
 * This is a pure-TypeScript FNV-1a expansion rather than `node:crypto` because
 * `@geoventra/contracts` is also bundled into the browser client. The API never trusts this
 * value for authorisation — the device serial is the real key.
 */
function stableId(serial: string): string {
  const digest = expandFnv1a(`geoventra:demo-fleet:${serial}`);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `5${digest.slice(13, 16)}`,
    `8${digest.slice(17, 20)}`,
    digest.slice(20, 32),
  ].join('-');
}

/** Minimal UTF-8 encoder — `TextEncoder` is not available in the shared lib target. */
function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (const character of input) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

/** FNV-1a (32-bit, four lanes) expanded to 128 bits of hex. */
function expandFnv1a(input: string): string {
  const offsets = [0x811c9dc5, 0x01000193, 0x9e3779b9, 0x85ebca6b];
  const bytes = utf8Bytes(input);
  const lanes = offsets.map((offset) => offset >>> 0);
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    const lane = i % lanes.length;
    const current = lanes[lane] ?? 0;
    lanes[lane] = Math.imul(current ^ byte, 0x01000193) >>> 0;
  }
  // Mix the lanes so short inputs still produce a well-distributed 128-bit value.
  let mixed = 0x9e3779b9;
  for (const lane of lanes) {
    mixed = (Math.imul(mixed ^ lane, 0x85ebca6b) >>> 0) + 0x165667b1;
    mixed = mixed >>> 0;
  }
  let hex = '';
  for (const lane of lanes) {
    const spread = Math.imul(lane ^ mixed, 0x27d4eb2f) >>> 0;
    hex += spread.toString(16).padStart(8, '0');
  }
  return hex;
}

function registrationFor(prefix: string, index: number): string {
  const suffix = String(1000 + ((index * 137) % 9000)).padStart(4, '0');
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const a = letters[(index * 7) % letters.length] ?? 'A';
  const b = letters[(index * 11 + 3) % letters.length] ?? 'B';
  return `${prefix} ${a}${b} ${suffix}`;
}

function buildFleet(): DemoVehicle[] {
  const fleet: DemoVehicle[] = [];
  let index = 0;
  for (const city of CITY_SPECS) {
    for (let slot = 0; slot < city.vehicles.length; slot += 1) {
      const spec = city.vehicles[slot];
      if (!spec) continue;
      const [label, category, fuelType] = spec;
      const serial = `GVT-${String(100000 + index)}`;
      const statusBias: DemoStatusBias =
        index % 17 === 0 ? 'often_offline' : index % 5 === 0 ? 'balanced' : 'mostly_online';
      fleet.push({
        id: stableId(serial),
        deviceId: serial,
        index,
        registrationNumber: registrationFor(city.registrationPrefix, index),
        name: `${city.name} ${label} ${String(slot + 1).padStart(2, '0')}`,
        category,
        fuelType,
        city: city.name,
        cityCode: city.code,
        cityName: city.name,
        statusBias,
        odometerStartKm: 5_000 + ((index * 3_137) % 180_000),
        engineHoursStart: 500 + ((index * 211) % 9_000),
        startFraction: ((index * 37) % 100) / 100,
      });
      index += 1;
    }
  }
  return fleet;
}

/** The canonical 120-vehicle Geoventra demo fleet. */
export const DEMO_FLEET: readonly DemoVehicle[] = Object.freeze(buildFleet());

/** City codes the simulator can route through. */
export const DEMO_CITY_CODES: readonly string[] = CITY_SPECS.map((city) => city.code);

/** Fallback for cities that are not in the route library (kept in sync with `geo.ts`). */
export const ROUTE_CITY_CODES: readonly string[] = CITY_CODES;
