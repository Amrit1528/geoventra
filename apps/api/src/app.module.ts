/**
 * GEOVENTRA — root NestJS module.
 *
 * The application is deliberately layered:
 *
 *   InfrastructureModule — database pool, configuration, health checks
 *   AuthModule           — JWT issuance, refresh rotation, permission guards
 *   RealtimeModule       — socket.io gateways (tracking + engine diagnostics)
 *   EngineDiagnosticsModule — the Phase 5.1 engine feature set
 *   TrackingModule       — telemetry ingestion and live positions
 */

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { InfrastructureModule } from './common/infrastructure/infrastructure.module.js';
import { AuthModule } from './auth/auth.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { EngineDiagnosticsModule } from './engine-diagnostics/engine-diagnostics.module.js';
import { TrackingModule } from './tracking/tracking.module.js';
import { GeofencesModule } from './geofences/geofences.module.js';
import { TripsModule } from './trips/trips.module.js';
import { HealthModule } from './health/health.module.js';

@Module({
  imports: [
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET ?? 'geoventra-development-access-secret',
      signOptions: { expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
    }),
    InfrastructureModule,
    AuthModule,
    GeofencesModule,
    TripsModule,
    TrackingModule,
    RealtimeModule,
    EngineDiagnosticsModule,
    HealthModule,
  ],
})
export class AppModule {}
