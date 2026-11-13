import {
  offsetMeters,
  SimulatorAdapter,
  type DemoVehicle,
  type NormalizedGpsEvent,
  type SimulatorFrame,
} from '@geoventra/contracts';
import { Prng } from './random.js';
import { RouteGeometry } from './route.js';
import { routeForVehicle } from '@geoventra/contracts';

export type VehicleMode = 'moving' | 'idle' | 'stopped' | 'offline';

const adapter = new SimulatorAdapter();

/**
 * One simulated tracker. It owns a position along a route loop, a speed profile, dwell timers and
 * connectivity gaps. The output is a *device frame* which is then normalized through the same
 * `SimulatorAdapter` a production gateway would use — the simulator never writes to the database.
 */
export class SimulatedVehicle {
  readonly vehicle: DemoVehicle;
  readonly route: RouteGeometry;
  private readonly rng: Prng;
  private progressKm: number;
  private speedKph: number;
  private targetSpeedKph: number;
  private mode: VehicleMode = 'moving';
  private modeRemainingMs = 0;
  private burstRemainingMs = 0;
  private lastHeading: number;
  private odometerKm: number;
  private engineHours: number;
  private batteryVoltage: number;
  private lastDwellAtMs = Number.NEGATIVE_INFINITY;
  private lastSampleAtMs = 0;
  private samplesPublished = 0;
  private targetRefreshMs = 0;

  constructor(vehicle: DemoVehicle, seed: string, intervalMs: number) {
    this.vehicle = vehicle;
    this.rng = new Prng(`${seed}:vehicle:${vehicle.index}:${vehicle.deviceId}`);
    this.route = new RouteGeometry(routeForVehicle(vehicle));
    this.progressKm = this.route.wrap(vehicle.startFraction * this.route.totalKm);
    const initial = this.route.pointAt(this.progressKm);
    this.lastHeading = initial.heading;
    this.speedKph = Math.round(this.route.totalKm > 0 ? this.routeCruise * 0.75 : 0);
    this.targetSpeedKph = this.speedKph;
    this.odometerKm = vehicle.odometerStartKm;
    this.engineHours = vehicle.engineHoursStart;
    this.batteryVoltage = 12.2 + this.rng.next() * 0.6;
    // Stagger target refreshes so the fleet does not change speed in lockstep.
    this.targetRefreshMs = Math.round(this.rng.range(10_000, 35_000) + intervalMs);
  }

  get currentMode(): VehicleMode {
    return this.mode;
  }

  get currentSpeedKph(): number {
    return this.speedKph;
  }

  get currentProgressKm(): number {
    return this.progressKm;
  }

  get publishedSamples(): number {
    return this.samplesPublished;
  }

  /**
   * Advance one simulation tick. Returns a normalized event, or `null` when the tracker is in a
   * connectivity gap (a real device simply stops reporting).
   */
  step(nowMs: number, intervalMs: number): NormalizedGpsEvent | null {
    if (this.mode === 'offline') {
      this.modeRemainingMs -= intervalMs;
      if (this.modeRemainingMs > 0) return null;
      this.mode = 'moving';
      this.speedKph = Math.min(this.speedKph, 18);
      this.modeRemainingMs = 0;
      this.batteryVoltage = 13.6 + this.rng.next() * 0.5;
    }

    if (this.mode === 'idle' || this.mode === 'stopped') {
      this.modeRemainingMs -= intervalMs;
      this.speedKph = 0;
      if (this.modeRemainingMs <= 0) {
        this.mode = 'moving';
        this.speedKph = 4 + this.rng.next() * 6;
        this.targetSpeedKph = this.routeCruise * this.rng.range(0.8, 1.12);
        this.targetRefreshMs = Math.round(this.rng.range(10_000, 30_000));
      }
      return this.publish(nowMs, intervalMs, this.mode === 'stopped');
    }

    if (this.shouldGoOffline(intervalMs)) {
      this.mode = 'offline';
      this.modeRemainingMs = this.offlineDurationMs();
      this.speedKph = 0;
      return null;
    }

    if (this.shouldStop(intervalMs)) {
      // Engine-off stop at a depot; engine-on idle at a customer stop.
      this.mode = this.rng.chance(0.25) ? 'stopped' : 'idle';
      this.modeRemainingMs = this.dwellDurationMs();
      this.lastDwellAtMs = nowMs;
      this.speedKph = 0;
      return this.publish(nowMs, intervalMs, this.mode === 'stopped');
    }

    this.advanceTarget(nowMs, intervalMs);
    this.advancePosition(intervalMs);
    return this.publish(nowMs, intervalMs, false);
  }

  private get routeCruise(): number {
    // Re-derived from the source route; kept as a getter to avoid duplicating manifest data.
    return routeForVehicle(this.vehicle).cruiseKph;
  }

  private advanceTarget(nowMs: number, intervalMs: number): void {
    this.targetRefreshMs -= intervalMs;
    if (this.targetRefreshMs <= 0) {
      this.targetRefreshMs = Math.round(this.rng.range(12_000, 40_000));
      if (this.burstRemainingMs <= 0 && this.rng.chance(this.overspeedChance())) {
        this.burstRemainingMs = Math.round(this.rng.range(18_000, 45_000));
        this.targetSpeedKph = this.overspeedTarget();
      } else {
        this.targetSpeedKph = this.routeCruise * this.rng.range(0.82, 1.14);
      }
    }
    if (this.burstRemainingMs > 0) {
      this.burstRemainingMs -= intervalMs;
      if (this.burstRemainingMs <= 0) this.targetSpeedKph = this.routeCruise * this.rng.range(0.75, 1.05);
    }

    // Real vehicles do not change speed instantly. Aggressive bursts accelerate harder.
    const seconds = intervalMs / 1_000;
    const maxDelta = (this.burstRemainingMs > 0 ? 11 : 5) * seconds;
    const delta = this.targetSpeedKph - this.speedKph;
    this.speedKph += Math.max(-maxDelta, Math.min(maxDelta, delta));
    this.speedKph = Math.max(0, Math.min(140, this.speedKph));
  }

  private advancePosition(intervalMs: number): void {
    const km = (this.speedKph * intervalMs) / 3_600_000;
    this.progressKm = this.route.wrap(this.progressKm + km);
    this.odometerKm += km;
    this.engineHours += intervalMs / 3_600_000;
    this.batteryVoltage = 13.6 + this.rng.range(-0.25, 0.55);
  }

  private shouldGoOffline(intervalMs: number): boolean {
    const rate = this.offlineRatePerMinute();
    return this.rng.chance(rate * (intervalMs / 60_000));
  }

  private offlineRatePerMinute(): number {
    switch (this.vehicle.statusBias) {
      case 'often_offline':
        return 0.1;
      case 'balanced':
        return 0.018;
      default:
        return 0.005;
    }
  }

  private offlineDurationMs(): number {
    switch (this.vehicle.statusBias) {
      case 'often_offline':
        return Math.round(this.rng.range(5, 12) * 60_000);
      case 'balanced':
        return Math.round(this.rng.range(2, 5) * 60_000);
      default:
        return Math.round(this.rng.range(1, 3) * 60_000);
    }
  }

  private shouldStop(intervalMs: number): boolean {
    // Dwell at a depot/customer stop for the first time we pass it.
    const nextStopKm = this.route.distanceToNextStop(this.progressKm);
    const stepKm = (this.speedKph * intervalMs) / 3_600_000;
    const reachedStop = nextStopKm <= Math.max(0.025, stepKm * 1.25);
    const dwellCooldownPassed = this.lastSampleAtMs - this.lastDwellAtMs > 3 * 60_000;
    if (reachedStop && dwellCooldownPassed && this.rng.chance(0.65)) return true;
    // Occasional unscheduled stops: traffic, loading, a chai break.
    return this.rng.chance(0.0009 * (intervalMs / 2_000));
  }

  private dwellDurationMs(): number {
    if (this.rng.chance(0.2)) return Math.round(this.rng.range(3, 9) * 60_000);
    return Math.round(this.rng.range(25, 150) * 1_000);
  }

  private overspeedChance(): number {
    // Only fast routes produce believable overspeed. Other routes have rare aggressive bursts.
    return this.routeCruise >= 44 ? 0.16 : 0.03;
  }

  private overspeedTarget(): number {
    const limit = this.vehicle.category === 'truck' || this.vehicle.category === 'bus'
      ? 80
      : this.vehicle.category === 'construction'
        ? 60
        : this.vehicle.category === 'car'
          ? 100
          : 90;
    return limit + this.rng.range(6, 18);
  }

  private publish(nowMs: number, intervalMs: number, ignitionOff: boolean): NormalizedGpsEvent {
    const point = this.route.pointAt(this.progressKm);
    const jitterM = this.speedKph > 2 ? this.rng.range(-3, 3) : this.rng.range(-1.5, 1.5);
    const jitter = offsetMeters(
      { lat: point.lat, lng: point.lng },
      this.rng.range(-4, 4),
      jitterM,
    );
    const heading =
      this.speedKph > 1
        ? (point.heading + this.rng.range(-6, 6) + 360) % 360
        : this.lastHeading;
    this.lastHeading = heading;

    const accuracy = this.rng.chance(0.12) ? this.rng.range(28, 70) : this.rng.range(4, 18);
    const signal = accuracy <= 25 ? 'ok' : accuracy <= 60 ? 'weak' : 'none';
    const engineRunning = !ignitionOff && this.mode !== 'offline';
    const battery = ignitionOff
      ? 11.9 + this.rng.range(0, 0.5)
      : engineRunning
        ? this.batteryVoltage
        : 12.0 + this.rng.range(0, 0.4);

    const frame: SimulatorFrame = {
      dev: this.vehicle.deviceId,
      vid: this.vehicle.id,
      lat: Number(jitter.lat.toFixed(6)),
      lng: Number(jitter.lng.toFixed(6)),
      // Cap speed at 200 km/h; numeric(6,2) precision limit is 9999.99 but a sane maximum for
      // simulated road vehicles is far lower. This prevents PostgreSQL numeric overflow
      // (numeric(6,2) permits a max of 9999.99, anything higher throws "numeric field overflow").
      spd: Number(Math.min(this.speedKph, 200).toFixed(1)),
      hdg: Math.round(heading),
      ign: engineRunning ? 1 : 0,
      ts: nowMs,
      acc: Number(accuracy.toFixed(1)),
      volt: Number(battery.toFixed(2)),
      odo: Number(this.odometerKm.toFixed(2)),
      ehr: Number(this.engineHours.toFixed(2)),
      sat: signal === 'none' ? this.rng.int(2, 5) : this.rng.int(8, 18),
      sig: signal,
    };

    this.lastSampleAtMs = nowMs;
    this.samplesPublished += 1;
    return adapter.normalize(frame)[0]!;
  }
}
