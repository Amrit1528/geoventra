import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { UniversalTelemetryService } from './universal-telemetry.service.js';
import { UniversalTelemetryController } from './universal-telemetry.controller.js';

@Module({
  providers: [DatabaseService, UniversalTelemetryService],
  controllers: [UniversalTelemetryController],
  exports: [UniversalTelemetryService],
})
export class UniversalTelemetryModule {}
