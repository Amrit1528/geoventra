/**
 * GEOVENTRA — audit logs module.
 *
 * Registers the audit logs controller and service.
 */

import { Module } from '@nestjs/common';
import { AuditLogsController } from './audit-logs.controller.js';
import { AuditLogsService } from './audit-logs.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}