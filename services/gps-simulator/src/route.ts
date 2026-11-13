/**
 * GEOVENTRA — route geometry for the GPS simulator.
 *
 * `RouteGeometry` wraps a `RouteManifest` (polyline + cruise speed + stop offsets) and
 * provides the movement primitives the simulated tracker uses: arc-length parameterisation,
 * heading computation and distance-to-next-stop lookups.
 */

import { bearingDegrees, haversineKm, type RouteManifest } from '@geoventra/contracts';

export interface RoutePoint {
  lat: number;
  lng: number;
  /** Initial bearing along the segment, in degrees clockwise from north. */
  heading: number;
}

export class RouteGeometry {
  private readonly manifest: RouteManifest;
  private readonly cumulativeKm: number[];
  private readonly totalKmInternal: number;

  constructor(manifest: RouteManifest) {
    this.manifest = manifest;
    this.cumulativeKm = [0];
    const points = manifest.points;
    let total = 0;
    for (let index = 1; index <= points.length; index += 1) {
      const previous = points[index - 1];
      const current = points[index % points.length];
      if (previous && current) {
        total += haversineKm(previous, current);
      }
      this.cumulativeKm.push(total);
    }
    this.totalKmInternal = Math.max(total, 0.001);
  }

  /** Total loop length in kilometres. */
  get totalKm(): number {
    return this.totalKmInternal;
  }

  /** Cruise speed for this route, in km/h. */
  get cruiseKph(): number {
    return this.manifest.cruiseKph;
  }

  /** Wrap an arc-length position into [0, totalKm). */
  wrap(km: number): number {
    if (!Number.isFinite(km)) return 0;
    const wrapped = km % this.totalKmInternal;
    return wrapped < 0 ? wrapped + this.totalKmInternal : wrapped;
  }

  /** The point on the loop at `km` (after wrapping). */
  pointAt(km: number): RoutePoint {
    const position = this.wrap(km);
    const segment = this.segmentIndexFor(position);
    const points = this.manifest.points;
    const from = points[segment] ?? points[0]!;
    const to = points[(segment + 1) % points.length] ?? points[0]!;

    const startKm = this.cumulativeKm[segment] ?? 0;
    const endKm = this.cumulativeKm[segment + 1] ?? this.totalKmInternal;
    const length = Math.max(endKm - startKm, 0.000_001);
    const ratio = Math.min(1, Math.max(0, (position - startKm) / length));

    return {
      lat: from.lat + (to.lat - from.lat) * ratio,
      lng: from.lng + (to.lng - from.lng) * ratio,
      heading: bearingDegrees(from, to),
    };
  }

  /** Distance along the loop to the next stop (or customer), in kilometres. */
  distanceToNextStop(km: number): number {
    const position = this.wrap(km);
    const offsets = this.manifest.stopOffsetsKm;
    if (offsets.length === 0) return Number.POSITIVE_INFINITY;

    let nearest = Number.POSITIVE_INFINITY;
    for (const offset of offsets) {
      const distance = offset >= position
        ? offset - position
        : offset + this.totalKmInternal - position;
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  private segmentIndexFor(position: number): number {
    // Linear scan is fine — loops have a handful of waypoints.
    for (let index = 0; index < this.cumulativeKm.length - 1; index += 1) {
      const start = this.cumulativeKm[index] ?? 0;
      const end = this.cumulativeKm[index + 1] ?? this.totalKmInternal;
      if (position >= start && position < end) return index;
    }
    return Math.max(0, this.cumulativeKm.length - 2);
  }
}
