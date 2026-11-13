/**
 * GEOVENTRA — device telemetry frames and their normalized form.
 *
 * A *frame* is what a physical tracker reports (compact keys, loosely typed). A *normalized
 * event* is what every gateway and the API ingestion endpoint agree on. The simulator is a
 * first-class citizen of this contract: it produces frames and normalizes them exactly like a
 * production gateway would.
 */

export const GPS_SIGNALS = ['ok', 'weak', 'none'] as const;
export type GpsSignal = (typeof GPS_SIGNALS)[number];

/** Compact device frame as emitted by trackers and by the simulator. */
export interface SimulatorFrame {
  /** Device serial / tracker id. */
  dev: string;
  /** Vehicle identifier the device is bound to. */
  vid: string;
  lat: number;
  lng: number;
  spd: number;
  hdg: number;
  ign: 0 | 1;
  ts: number;
  acc: number;
  volt: number;
  odo: number;
  ehr: number;
  sat: number;
  sig: GpsSignal;
}

/** Canonical telemetry event stored by the API and consumed by the live-tracking UI. */
export interface NormalizedGpsEvent {
  deviceId: string;
  vehicleId: string;
  latitude: number;
  longitude: number;
  speedKph: number;
  heading: number;
  ignition: boolean;
  batteryVoltage: number | null;
  accuracyM: number | null;
  gpsSignal: GpsSignal;
  satelliteCount: number | null;
  odometerKm: number | null;
  engineHours: number | null;
  recordedAt: string;
}

export interface TelemetryIngestResponse {
  accepted: number;
  rejected: number;
  receivedAt: string;
}
