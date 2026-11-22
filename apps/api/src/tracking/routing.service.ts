import { Injectable, Logger } from '@nestjs/common';

interface RouteResult {
  roadDistanceKm: number | null;
  etaMinutes: number | null;
  status: 'available' | 'unavailable' | 'error';
  provider: string | null;
  calculatedAt: string;
}

interface CacheEntry {
  results: RouteResult[];
  expires: number;
}

@Injectable()
export class RoutingService {
  private readonly logger = new Logger(RoutingService.name);
  private readonly cache = new Map<string, CacheEntry>();

  private providerUrl(): string | null {
    const url = process.env.ROUTING_PROVIDER_URL;
    return url ? url.replace(/\/$/, '') : null;
  }

  private cacheTtlMs(): number {
    return Number(process.env.ROUTING_CACHE_TTL_SECONDS ?? 300) * 1000;
  }

  async routeMatrix(
    ref: { latitude: number; longitude: number },
    destinations: Array<{ latitude: number; longitude: number }>,
  ): Promise<RouteResult[]> {
    const provider = this.providerUrl();
    const now = new Date().toISOString();
    if (!provider || destinations.length === 0) {
      return destinations.map(() => ({ roadDistanceKm: null, etaMinutes: null, status: 'unavailable', provider: null, calculatedAt: now }));
    }

    const cacheKey = `${ref.latitude.toFixed(5)},${ref.longitude.toFixed(5)}|${destinations.map((d) => `${d.latitude.toFixed(5)},${d.longitude.toFixed(5)}`).join(';')}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return cached.results;

    try {
      const coords = [`${ref.longitude},${ref.latitude}`, ...destinations.map((d) => `${d.longitude},${d.latitude}`)].join(';');
      const destIndices = destinations.map((_, i) => i + 1).join(';');
      const url = `${provider}/table/v1/driving/${coords}?sources=0&destinations=${destIndices}&annotations=distance,duration`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`routing provider ${res.status}`);
      const json: any = await res.json();
      const distances = json?.distances?.[0] ?? [];
      const durations = json?.durations?.[0] ?? [];
      const results = destinations.map((_, i) => {
        const d = distances[i];
        const t = durations[i];
        return {
          roadDistanceKm: Number.isFinite(d) ? Number((d / 1000).toFixed(2)) : null,
          etaMinutes: Number.isFinite(t) ? Number((t / 60).toFixed(1)) : null,
          status: (Number.isFinite(d) ? 'available' : 'unavailable') as 'available' | 'unavailable',
          provider: 'osrm',
          calculatedAt: now,
        };
      });
      this.cache.set(cacheKey, { results, expires: Date.now() + this.cacheTtlMs() });
      return results;
    } catch (error) {
      this.logger.warn(`Routing failed: ${(error as Error).message}`);
      const results = destinations.map(() => ({ roadDistanceKm: null, etaMinutes: null, status: 'error' as const, provider: null, calculatedAt: now }));
      return results;
    }
  }
}
