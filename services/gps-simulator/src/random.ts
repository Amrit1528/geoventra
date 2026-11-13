/**
 * GEOVENTRA — deterministic pseudo-random number generator.
 *
 * The simulator must produce the same fleet trajectory for the same seed so that demo data
 * is reproducible. `Prng` implements a SplitMix32-style generator suitable for scheduling,
 * jitter and occupancy decisions. It is deliberately not cryptographic.
 */

export class Prng {
  private state: number;

  constructor(seed: string) {
    this.state = hashSeed(seed);
  }

  /** Next float in the half-open interval [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** Float in the half-open interval [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Inclusive integer in [min, max]. */
  int(min: number, max: number): number {
    const low = Math.ceil(min);
    const high = Math.floor(max);
    if (high <= low) return low;
    return low + Math.floor(this.next() * (high - low + 1));
  }

  /** True with probability `probability` (clamped to [0, 1]). */
  chance(probability: number): boolean {
    const p = Math.min(1, Math.max(0, probability));
    return this.next() < p;
  }

  /** Pick a uniformly random element. */
  pick<T>(items: readonly T[]): T | undefined {
    if (items.length === 0) return undefined;
    return items[this.int(0, items.length - 1)];
  }
}

/** Stable string → 32-bit seed mapping (FNV-1a). */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
