/**
 * GEOVENTRA — health module.
 *
 * Exposes the liveness and readiness probes. The routes sit outside the `/api/v1` prefix so
 * orchestrators can reach them without knowing the API version.
 */

import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/auth/public.decorator.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

interface HealthResponse {
  status: 'ok' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  checks: Record<string, { status: 'up' | 'down'; latencyMs?: number }>;
}

@Controller('health')
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(private readonly database: DatabaseService) {}

  /** Liveness and dependency readiness. */
  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const started = Date.now();
    const databaseUp = await this.database.ping();
    const checks: HealthResponse['checks'] = {
      database: {
        status: databaseUp ? 'up' : 'down',
        latencyMs: Date.now() - started,
      },
    };
    return {
      status: databaseUp ? 'ok' : 'degraded',
      uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
      checks,
    };
  }

  /** Liveness only — never touches a dependency. */
  @Public()
  @Get('live')
  live(): { status: 'ok'; timestamp: string } {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  /** Readiness — every dependency must be reachable. */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok' | 'degraded'; timestamp: string }> {
    const databaseUp = await this.database.ping();
    return {
      status: databaseUp ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
    };
  }
}
