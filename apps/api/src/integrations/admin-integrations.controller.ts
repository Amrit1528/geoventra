import { Controller } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { CredentialService } from './credential.service.js';
import { ProviderRegistryService } from './provider-registry.service.js';
import { NotificationQueueService } from '../notification-queue/notification-queue.service.js';
import { NotificationWorkerService } from '../notification-queue/notification-worker.service.js';
import { WebhookService } from './webhook.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Controller('admin/integrations')
export class AdminIntegrationsController extends IntegrationsController {
  constructor(
    credentials: CredentialService,
    registry: ProviderRegistryService,
    queue: NotificationQueueService,
    worker: NotificationWorkerService,
    webhooks: WebhookService,
    database: DatabaseService,
  ) {
    super(credentials, registry, queue, worker, webhooks, database);
  }
}