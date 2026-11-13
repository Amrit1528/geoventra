/**
 * GEOVENTRA — trip detection.
 *
 * Deterministic, side-effect-free trip lifecycle logic used by the telemetry ingest path.
 * A trip starts when a vehicle's ignition turns on and closes when it turns off again.
 * Distance is derived from the odometer delta accumulated during the open trip.
 */

export interface TripSample {
  vehicleId: string;
  ignition: boolean;
  latitude: number;
  longitude: number;
  speedKph: number;
  /** Cumulative vehicle odometer, if the tracker reports one. */
  odometerKm: number | null;
  recordedAt: Date;
}

export interface ActiveTripState {
  id: string;
  /** Odometer reading captured when the trip started. */
  startOdometerKm: number | null;
  distanceKm: number;
  maxSpeedKph: number;
  idleSeconds: number;
  startedAt: Date;
  /** Timestamp of the previous sample, used to apportion idle time. */
  lastSampleAt: Date | null;
}

export type TripAction = 'start' | 'update' | 'close' | 'none';

export interface TripTransition {
  action: TripAction;
  /** Fields to persist on the trip row for update/close transitions. */
  patch?: {
    distanceKm: number;
    maxSpeedKph: number;
    idleSeconds: number;
    endLatitude?: number;
    endLongitude?: number;
    avgSpeedKph?: number;
    durationSeconds?: number;
    endLabel?: string;
  };
}

const MAX_IDLE_STEP_SECONDS = 180; // A vehicle stopped for >3 minutes between samples is a gap, not idle time.

/** Decide what to do with an ingested sample. */
export function evaluateTripTransition(
  activeTrip: ActiveTripState | null,
  sample: TripSample,
): TripTransition {
  // ── Ignition on ───────────────────────────────────────────────────────────
  if (sample.ignition) {
    if (!activeTrip) {
      // New trip starts here: caller inserts the row.
      return { action: 'start' };
    }

    // Odometer is the most reliable distance source. The trip distance is the
    // difference between the current odometer and the value at trip start; we
    // never let it decrease (trackers can resync odometers mid-trip).
    let distanceKm = activeTrip.distanceKm;
    if (
      activeTrip.startOdometerKm !== null &&
      sample.odometerKm !== null &&
      sample.odometerKm >= activeTrip.startOdometerKm
    ) {
      distanceKm = Math.max(distanceKm, sample.odometerKm - activeTrip.startOdometerKm);
    }

    const maxSpeedKph = Math.max(activeTrip.maxSpeedKph, sample.speedKph);

    // Idle time: ignition on but not moving. The delta from the previous sample is
    // what counts towards the idle total.
    let idleSeconds = activeTrip.idleSeconds;
    if (sample.speedKph === 0 && activeTrip.lastSampleAt) {
      const deltaSeconds = (sample.recordedAt.getTime() - activeTrip.lastSampleAt.getTime()) / 1000;
      if (deltaSeconds > 0 && deltaSeconds <= MAX_IDLE_STEP_SECONDS) {
        idleSeconds += deltaSeconds;
      }
    }

    return {
      action: 'update',
      patch: { distanceKm, maxSpeedKph, idleSeconds },
    };
  }

  // ── Ignition off ──────────────────────────────────────────────────────────
  if (!activeTrip) {
    return { action: 'none' };
  }

  let distanceKm = activeTrip.distanceKm;
  if (
    activeTrip.startOdometerKm !== null &&
    sample.odometerKm !== null &&
    sample.odometerKm >= activeTrip.startOdometerKm
  ) {
    distanceKm = Math.max(distanceKm, sample.odometerKm - activeTrip.startOdometerKm);
  }

  const durationSeconds = Math.max(0, Math.round((sample.recordedAt.getTime() - activeTrip.startedAt.getTime()) / 1000));
  const durationHours = durationSeconds / 3600;
  const avgSpeedKph = Math.min(400, durationHours > 0 ? distanceKm / durationHours : 0);

  return {
    action: 'close',
    patch: {
      distanceKm,
      maxSpeedKph: activeTrip.maxSpeedKph,
      idleSeconds: activeTrip.idleSeconds,
      endLatitude: sample.latitude,
      endLongitude: sample.longitude,
      avgSpeedKph,
      durationSeconds,
      endLabel: 'Destination',
    },
  };
}
