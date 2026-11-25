/**
 * GEOVENTRA — notifications module.
 */

import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsRepository } from './notifications.repository.js';
import { NotificationQueueModule } from '../notification-queue/notification-queue.module.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Module({
  imports: [NotificationQueueModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsRepository, DatabaseService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
