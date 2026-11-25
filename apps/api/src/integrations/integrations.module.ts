import { Module } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AdminService } from '../admin/admin.service.js';
import { CredentialCryptoService } from './credential-crypto.service.js';
import { ProviderRegistryService } from './provider-registry.service.js';
import { CredentialService } from './credential.service.js';
import { WebhookService } from './webhook.service.js';
import { IntegrationsController } from './integrations.controller.js';
import { NotificationQueueModule } from '../notification-queue/notification-queue.module.js';
import { AdminIntegrationsController } from './admin-integrations.controller.js';
import { AdminExternalIntegrationsController } from './admin-external-integrations.controller.js';
import { WebhooksController } from './webhooks.controller.js';

@Module({
  imports: [NotificationQueueModule],
  controllers: [IntegrationsController, AdminIntegrationsController, AdminExternalIntegrationsController, WebhooksController],
  providers: [
    DatabaseService,
    AdminService,
    CredentialCryptoService,
    ProviderRegistryService,
    CredentialService,
    WebhookService,
  ],
  exports: [CredentialService, ProviderRegistryService, WebhookService, CredentialCryptoService],
})
export class IntegrationsModule {}
