import { Controller } from '@nestjs/common';
import { NotificationQueueController } from './notification-queue.controller.js';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationWorkerService } from './notification-worker.service.js';

@Controller('admin/notifications/queue')
export class AdminNotificationQueueController extends NotificationQueueController {
  constructor(queue: NotificationQueueService, worker: NotificationWorkerService) {
    super(queue, worker);
  }
}