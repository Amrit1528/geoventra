/** GEOVENTRA — vehicle telematics module.
 *  Aggregates all vehicle device, OBD, engine, tyre, fuel, odometer and alert modules.
 */

import { Module, forwardRef } from '@nestjs/common';
import { DevicesModule } from '../devices/device.module.js';
import { DevicesService } from '../devices/device.service.js';
import { ObdModule } from '../obd/obd.module.js';
import { ObdService } from '../obd/obd.service.js';
import { EngineModule } from '../engine/engine.module.js';
import { EngineService } from '../engine/engine.service.js';
import { TyreModule } from '../tyres/tyre.module.js';
import { TyreService } from '../tyres/tyre.service.js';
import { InsuranceModule } from '../insurance/insurance.module.js';
import { InsuranceService } from '../insurance/insurance.service.js';
import { OdometerModule } from '../odometer/odometer.module.js';
import { OdometerService } from '../odometer/odometer.service.js';
import { FuelModule } from '../fuel/fuel.module.js';
import { FuelService } from '../fuel/fuel.service.js';
import { AlertModule } from '../alerts/alert.module.js';
import { AlertService } from '../alerts/alert.service.js';
import { VehicleTelemetryModule } from '../telemetry/vehicle-telemetry.module.js';
import { VehicleTelemetryService } from '../telemetry/vehicle-telemetry.service.js';
import { AdminService } from '../admin/admin.service.js';

@Module({
  imports: [
    DevicesModule,
    forwardRef(() => ObdModule),
    EngineModule,
    TyreModule,
    InsuranceModule,
    OdometerModule,
    FuelModule,
    AlertModule,
    VehicleTelemetryModule,
  ],
  providers: [DevicesService, ObdService, EngineService, TyreService, InsuranceService, OdometerService, FuelService, AlertService, AdminService, VehicleTelemetryService],
  exports: [DevicesService, ObdService, EngineService, TyreService, InsuranceService, OdometerService, FuelService, AlertService, VehicleTelemetryService],
})
export class VehicleTelematicsModule {}
