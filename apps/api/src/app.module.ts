/** GEOVENTRA — root NestJS module.
 *  The application is deliberately layered:
 *
 *    InfrastructureModule — database pool, configuration, health checks
 *    AuthModule           — JWT issuance, refresh rotation, permission guards
 *    RealtimeModule       — socket.io gateways (tracking + engine diagnostics)
 *    EngineDiagnosticsModule — the Phase 5.1 engine feature set
 *    TrackingModule       — telemetry ingestion and live positions
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
import { NotificationsModule } from './notifications/notifications.module.js';
import { TpmsModule } from './tpms/tpms.module.js';
import { DevicesModule } from './devices/device.module.js';
import { ObdModule } from './obd/obd.module.js';
import { EngineModule } from './engine/engine.module.js';
import { TyreModule } from './tyres/tyre.module.js';
import { InsuranceModule } from './insurance/insurance.module.js';
import { OdometerModule } from './odometer/odometer.module.js';
import { FuelModule } from './fuel/fuel.module.js';
import { AlertModule } from './alerts/alert.module.js';
import { VehicleTelematicsModule } from './vehicle-telematics/vehicle-telematics.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { AdminModule } from './admin/admin.module.js';

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
    NotificationsModule,
    TpmsModule,
    HealthModule,
    AdminModule,
    DevicesModule,
    ObdModule,
    EngineModule,
    TyreModule,
    InsuranceModule,
    OdometerModule,
    FuelModule,
    AlertModule,
    VehicleTelematicsModule,
    VehiclesModule,
  ],
})
export class AppModule {}
