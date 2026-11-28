import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class ReverseGeocodeService {
  private readonly logger = new Logger(ReverseGeocodeService.name);

  constructor(private readonly db: DatabaseService) {}

  async resolve(latitude: number, longitude: number): Promise<string | null> {
    const cached = await this.db.queryOne<{ location_name: string }>(
      `SELECT location_name FROM geoventra.reverse_geocode_cache
        WHERE round(latitude::numeric,5)=round($1::numeric,5)
          AND round(longitude::numeric,5)=round($2::numeric,5)
          AND expires_at > now()
        LIMIT 1`,
      [latitude, longitude],
    );
    if (cached?.location_name) return cached.location_name;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&addressdetails=1`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Geoventra/1.0 (idle-intelligence)' },
        signal: controller.signal,
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { display_name?: string; address?: Record<string, string> };
      const name = this.formatAddress(json);
      if (name) {
        await this.db.query(
          `INSERT INTO geoventra.reverse_geocode_cache (latitude, longitude, location_name, provider, cached_at, expires_at)
           VALUES ($1,$2,$3,'nominatim',now(),now()+interval '30 days')
           ON CONFLICT DO NOTHING`,
          [latitude, longitude, name],
        ).catch(() => undefined);
      }
      return name;
    } catch (error) {
      this.logger.warn(`Reverse geocode failed: ${(error as Error).message}`);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private formatAddress(json: { display_name?: string; address?: Record<string, string> }): string | null {
    const a = json.address ?? {};
    const parts = [
      a.road || a.pedestrian || a.footway,
      a.neighbourhood || a.suburb || a.quarter || a.hamlet,
      a.city || a.town || a.village || a.municipality,
      a.state || a.region,
    ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
    if (parts.length > 0) return Array.from(new Set(parts)).join(', ');
    if (json.display_name && json.display_name.trim().length > 0) return json.display_name.trim();
    return null;
  }
}