import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { NotificationQueueRepository } from './notification-queue.repository.js';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationWorkerService } from './notification-worker.service.js';
import { NotificationQueueController } from './notification-queue.controller.js';
import { AdminNotificationQueueController } from './admin-notification-queue.controller.js';

@Module({
  controllers: [NotificationQueueController, AdminNotificationQueueController],
  providers: [NotificationQueueRepository, NotificationQueueService, NotificationWorkerService, DatabaseService],
  exports: [NotificationQueueService, NotificationQueueRepository, NotificationWorkerService],
})
export class NotificationQueueModule {}
