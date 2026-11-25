import { Controller } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller.js';
import { CredentialService } from './credential.service.js';
import { ProviderRegistryService } from './provider-registry.service.js';
import { NotificationQueueService } from '../notification-queue/notification-queue.service.js';
import { NotificationWorkerService } from '../notification-queue/notification-worker.service.js';
import { WebhookService } from './webhook.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Controller('admin/external-integrations')
export class AdminExternalIntegrationsController extends IntegrationsController {
  constructor(c: CredentialService, r: ProviderRegistryService, q: NotificationQueueService, w: NotificationWorkerService, h: WebhookService, d: DatabaseService) {
    super(c, r, q, w, h, d);
  }
}