/** GEOVENTRA — admin module.
 *  Registers the admin controllers and services for administration features.
 */

import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { UsersController } from './users/users.controller.js';
import { UsersService } from './users/users.service.js';
import { RolesController } from './roles/roles.controller.js';
import { RolesService } from './roles/roles.service.js';
import { ApiKeysController } from './api-keys/api-keys.controller.js';
import { ApiKeysService } from './api-keys/api-keys.service.js';
import { AuditLogsController } from './audit-logs/audit-logs.controller.js';
import { AuditLogsService } from './audit-logs/audit-logs.service.js';
import { FleetGroupsController } from './fleet-groups/fleet-groups.controller.js';
import { FleetGroupsService } from './fleet-groups/fleet-groups.service.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import { NotificationsService } from './notifications/notifications.service.js';
import { PreferencesController } from './preferences/preferences.controller.js';
import { PreferencesService } from './preferences/preferences.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Module({
  controllers: [
    UsersController,
    RolesController,
    ApiKeysController,
    AuditLogsController,
    FleetGroupsController,
    NotificationsController,
    PreferencesController,
  ],
  providers: [
    AdminService,
    UsersService,
    RolesService,
    ApiKeysService,
    AuditLogsService,
    FleetGroupsService,
    NotificationsService,
    PreferencesService,
    DatabaseService,
  ],
  exports: [AdminService],
})
export class AdminModule {}
