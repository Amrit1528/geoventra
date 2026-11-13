/**
 * GEOVENTRA — geodesic helpers and the deterministic route library used by the GPS simulator.
 *
 * The simulator never writes to the database; it moves a virtual tracker along a polyline
 * route and emits device frames. The routes are closed loops through real coordinates so the
 * generated telemetry looks like a real city driving pattern.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteWaypoint extends LatLng {
  label: string;
  kind: 'depot' | 'customer' | 'waypoint';
}

export interface RouteManifest {
  id: string;
  cityCode: string;
  cityName: string;
  /** Cruise speed in km/h used by the simulator as the baseline target speed. */
  cruiseKph: number;
  /** Closed polyline describing the loop. The last point is not repeated — the loop wraps. */
  points: RouteWaypoint[];
  /** Cumulative distance (km from the loop start) at which the vehicle tends to dwell. */
  stopOffsetsKm: number[];
}

const EARTH_RADIUS_KM = 6371.0088;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance between two coordinates, in kilometres. */
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Offset a coordinate by a local east/north delta in metres.
 * Used by the simulator to add sub-metre GPS jitter without drifting off the route.
 */
export function offsetMeters(point: LatLng, eastMeters: number, northMeters: number): LatLng {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = 111_320 * Math.cos(toRad(point.lat));
  return {
    lat: point.lat + northMeters / metersPerDegLat,
    lng: point.lng + eastMeters / (metersPerDegLng === 0 ? 1 : metersPerDegLng),
  };
}

/** Initial bearing from `a` to `b`, in degrees clockwise from north (0–360). */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

interface CityRouteSpec {
  code: string;
  name: string;
  cruiseKph: number;
  points: Array<[number, number, string, RouteWaypoint['kind']]>;
}

/**
 * A small library of city loops. Coordinates are approximate city centres and suburbs; the
 * exact geography does not matter, only that each loop is plausible and deterministic.
 */
const CITY_ROUTES: CityRouteSpec[] = [
  {
    code: 'BOM',
    name: 'Mumbai',
    cruiseKph: 42,
    points: [
      [19.076, 72.8777, 'Andheri Depot', 'depot'],
      [19.1136, 72.8697, 'Bandra West', 'customer'],
      [19.2183, 72.9781, 'Thane', 'waypoint'],
      [19.218, 72.978, 'Thane Depot', 'depot'],
      [19.033, 72.5297, 'Vashi', 'customer'],
      [18.9388, 72.8386, 'Chembur', 'waypoint'],
      [18.8937, 72.8041, 'Navi Mumbai', 'customer'],
      [19.033, 72.5297, 'Powai', 'waypoint'],
      [19.076, 72.8777, 'Andheri Depot', 'depot'],
    ],
  },
  {
    code: 'DEL',
    name: 'Delhi',
    cruiseKph: 46,
    points: [
      [28.6139, 77.209, 'Connaught Place', 'depot'],
      [28.7041, 77.1025, 'Rohini', 'customer'],
      [28.5921, 77.226, 'Okhla', 'customer'],
      [28.4595, 77.0266, 'Gurugram', 'waypoint'],
      [28.5535, 77.2581, 'Noida', 'customer'],
      [28.6219, 77.2197, 'Indraprastha', 'waypoint'],
      [28.6139, 77.209, 'Connaught Place', 'depot'],
    ],
  },
  {
    code: 'BLR',
    name: 'Bengaluru',
    cruiseKph: 38,
    points: [
      [12.9716, 77.5946, 'MG Road', 'depot'],
      [13.0067, 77.5636, 'Koramangala', 'customer'],
      [12.9284, 77.6069, 'JP Nagar', 'customer'],
      [12.9698, 77.7500, 'Whitefield', 'waypoint'],
      [12.9352, 77.6245, 'BTM Layout', 'customer'],
      [12.9716, 77.5946, 'MG Road', 'depot'],
    ],
  },
  {
    code: 'HYD',
    name: 'Hyderabad',
    cruiseKph: 40,
    points: [
      [17.385, 78.4867, 'Secunderabad', 'depot'],
      [17.4483, 78.5675, 'Kukatpally', 'customer'],
      [17.4126, 78.5126, 'Banjara Hills', 'waypoint'],
      [17.3373, 78.3499, 'Shamshabad', 'depot'],
      [17.385, 78.4867, 'Secunderabad', 'depot'],
    ],
  },
  {
    code: 'MAA',
    name: 'Chennai',
    cruiseKph: 39,
    points: [
      [13.0827, 80.2707, 'Guindy', 'depot'],
      [13.0338, 80.2686, 'Velachery', 'customer'],
      [13.0067, 80.2206, 'Adyar', 'customer'],
      [12.9716, 80.1948, 'Tambaram', 'waypoint'],
      [12.9231, 80.1833, 'Pallavaram', 'customer'],
      [13.0827, 80.2707, 'Guindy', 'depot'],
    ],
  },
  {
    code: 'PNQ',
    name: 'Pune',
    cruiseKph: 41,
    points: [
      [18.5204, 73.8567, 'Shivajinagar', 'depot'],
      [18.5362, 73.8940, 'Baner', 'customer'],
      [18.5018, 73.8636, 'Kothrud', 'customer'],
      [18.5913, 73.8114, 'Pimpri', 'waypoint'],
      [18.4088, 73.8907, 'Pune Station', 'depot'],
      [18.5204, 73.8567, 'Shivajinagar', 'depot'],
    ],
  },
  {
    code: 'AMD',
    name: 'Ahmedabad',
    cruiseKph: 37,
    points: [
      [23.0225, 72.5714, 'CG Road', 'depot'],
      [23.0387, 72.5678, 'Navrangpura', 'customer'],
      [23.0509, 72.5414, 'Maninagar', 'customer'],
      [22.9947, 72.5053, 'Naroda', 'waypoint'],
      [23.0225, 72.5714, 'CG Road', 'depot'],
    ],
  },
  {
    code: 'JAI',
    name: 'Jaipur',
    cruiseKph: 36,
    points: [
      [26.9124, 75.7873, 'MI Road', 'depot'],
      [26.8606, 75.8076, 'Malviya Nagar', 'customer'],
      [26.9365, 75.7877, 'Vaishali Nagar', 'customer'],
      [26.8500, 75.7600, 'Sanganer', 'waypoint'],
      [26.9124, 75.7873, 'MI Road', 'depot'],
    ],
  },
  {
    code: 'CCU',
    name: 'Kolkata',
    cruiseKph: 34,
    points: [
      [22.5726, 88.3639, 'Park Street', 'depot'],
      [22.5187, 88.3814, 'Howrah', 'customer'],
      [22.5764, 88.4095, 'Salt Lake', 'waypoint'],
      [22.6534, 88.4348, 'Dum Dum', 'customer'],
      [22.5461, 88.3426, 'Behala', 'customer'],
      [22.5726, 88.3639, 'Park Street', 'depot'],
    ],
  },
  {
    code: 'LKO',
    name: 'Lucknow',
    cruiseKph: 36,
    points: [
      [26.8467, 80.9462, 'Hazratganj', 'depot'],
      [26.8697, 80.9462, 'Hazratganj North', 'customer'],
      [26.889, 80.9395, 'Gomti Nagar', 'customer'],
      [26.9, 81.0, 'Indira Nagar', 'waypoint'],
      [26.8467, 80.9462, 'Hazratganj', 'depot'],
    ],
  },
  {
    code: 'STI',
    name: 'Surat',
    cruiseKph: 38,
    points: [
      [21.1702, 72.8311, 'Adajan', 'depot'],
      [21.2049, 72.8509, 'Udhna', 'customer'],
      [21.1979, 72.775, 'Udhna West', 'customer'],
      [21.222, 72.8439, 'Hazira', 'waypoint'],
      [21.1702, 72.8311, 'Adajan', 'depot'],
    ],
  },
  {
    code: 'IDR',
    name: 'Indore',
    cruiseKph: 35,
    points: [
      [22.7196, 75.8577, 'Vijay Nagar', 'depot'],
      [22.7533, 75.8937, 'Rau', 'customer'],
      [22.6547, 75.7413, 'Pithampur', 'waypoint'],
      [22.6793, 75.8166, 'Palasia', 'customer'],
      [22.7196, 75.8577, 'Vijay Nagar', 'depot'],
    ],
  },
];

const ROUTES_BY_CODE = new Map<string, RouteManifest>(
  CITY_ROUTES.map((spec) => {
    const points: RouteWaypoint[] = spec.points.map(([lat, lng, label, kind]) => ({
      lat,
      lng,
      label,
      kind,
    }));
    // The loop's final waypoint repeats the first one — drop it so the geometry does not
    // double-count the closing segment.
    const first = points[0];
    const last = points[points.length - 1];
    if (first && last && first.lat === last.lat && first.lng === last.lng) {
      points.pop();
    }
    return [
      spec.code,
      {
        id: `route-${spec.code.toLowerCase()}`,
        cityCode: spec.code,
        cityName: spec.name,
        cruiseKph: spec.cruiseKph,
        points,
        stopOffsetsKm: [],
      },
    ];
  }),
);

function computeStopOffsets(route: RouteManifest): number[] {
  const offsets: number[] = [];
  let cumulative = 0;
  const points = route.points;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    if (!current || !next) continue;
    const segment = haversineKm(current, next);
    if (current.kind === 'depot' || current.kind === 'customer') {
      offsets.push(cumulative);
    }
    cumulative += segment;
  }
  return offsets;
}

for (const route of ROUTES_BY_CODE.values()) {
  route.stopOffsetsKm = computeStopOffsets(route);
}

export const CITY_CODES: readonly string[] = CITY_ROUTES.map((route) => route.code);

/**
 * Resolve the route manifest for a demo vehicle. Vehicles cycle deterministically through the
 * city library so a given fleet slice always yields the same geography. An explicit city code
 * that matches a known route is used as-is.
 */
export function routeForVehicle(vehicle: { cityCode?: string; index: number }): RouteManifest {
  const explicit = vehicle.cityCode ? ROUTES_BY_CODE.get(vehicle.cityCode) : undefined;
  if (explicit) return explicit;

  const codes = CITY_CODES;
  const code = codes[vehicle.index % codes.length] ?? 'BOM';
  const route = ROUTES_BY_CODE.get(code) ?? ROUTES_BY_CODE.get('BOM');
  if (!route) {
    throw new Error('Route library is empty');
  }
  return route;
}
