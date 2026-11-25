import { Body, Controller, Get, Param, Post, Put, Query, UseGuards, HttpCode, HttpStatus, Delete, Inject } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { Public } from '../common/auth/public.decorator.js';
import { CredentialService } from './credential.service.js';
import { ProviderRegistryService } from './provider-registry.service.js';
import { NotificationQueueService } from '../notification-queue/notification-queue.service.js';
import { NotificationWorkerService } from '../notification-queue/notification-worker.service.js';
import { WebhookService } from './webhook.service.js';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(
    @Inject(CredentialService) private readonly credentials: CredentialService,
    @Inject(ProviderRegistryService) private readonly registry: ProviderRegistryService,
    @Inject(NotificationQueueService) private readonly queue: NotificationQueueService,
    @Inject(NotificationWorkerService) private readonly worker: NotificationWorkerService,
    @Inject(WebhookService) private readonly webhookService: WebhookService,
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {
    this.worker.setDeps({ getProvider: (job) => this.registry.getForJob(job) });
  }

  @Get('providers')
  @RequirePermissions('settings.read')
  async listProviders(@CurrentUser() user: AuthenticatedUser) {
    const creds = await this.credentials.list(user.organisationId);
    const reg = this.registry.list();
    return { data: reg.map((p) => {
      const c = creds.find((x: any) => x.provider === p.name);
      return { ...p, credential: c ? { id: c.id, status: c.status, verifiedAt: c.verified_at, updatedAt: c.updated_at } : null };
    }) };
  }

  @Get('providers/:provider')
  @RequirePermissions('settings.read')
  async getProvider(@Param('provider') provider: string, @CurrentUser() user: AuthenticatedUser) {
    const masked = await this.credentials.getMasked(user.organisationId, provider);
    const reg = this.registry.get(provider);
    return { provider, runtime: reg ? { name: reg.name, channel: reg.channel, simulated: reg.simulated, status: reg.getStatus() } : null, credential: masked };
  }

  @Put('providers/:provider/credentials')
  @RequirePermissions('settings.write')
  async saveCredentials(@Param('provider') provider: string, @Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    const channel = body?.channel || this.registry.get(provider)?.channel || 'email';
    return this.credentials.upsert(user.organisationId, provider, channel, body?.config ?? body ?? {}, user.id);
  }

  @Delete('providers/:provider/credentials')
  @RequirePermissions('settings.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCredentials(@Param('provider') provider: string, @CurrentUser() user: AuthenticatedUser) {
    await this.credentials.disable(user.organisationId, provider, user.id);
    return {};
  }

  @Post('providers/:provider/verify')
  @RequirePermissions('settings.write')
  async verifyProvider(@Param('provider') provider: string, @CurrentUser() user: AuthenticatedUser) {
    return this.credentials.verify(user.organisationId, provider, user.id);
  }

  @Get('queue/stats')
  @RequirePermissions('settings.read')
  async queueStats(@CurrentUser() user: AuthenticatedUser) {
    const stats = await this.queue.stats(user.organisationId);
    const rates = await this.queue.providerFailureRates(user.organisationId);
    return { stats, providerFailureRates: rates };
  }

  @Get('queue/jobs')
  @RequirePermissions('settings.read')
  async queueJobs(@Query() query: any, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.listJobs(user.organisationId, {
      status: query?.status,
      channel: query?.channel,
      page: query?.page ? Number(query.page) : 1,
      pageSize: query?.pageSize ? Number(query.pageSize) : 50,
    });
  }

  @Post('queue/jobs/:id/retry')
  @RequirePermissions('settings.write')
  async retryJob(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.retryJob(id, user.organisationId);
  }

  @Get('queue/dead-letter')
  @RequirePermissions('settings.read')
  async deadLetter(@Query() query: any, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.listJobs(user.organisationId, { status: 'DEAD_LETTER', page: query?.page ? Number(query.page) : 1, pageSize: query?.pageSize ? Number(query.pageSize) : 50 });
  }

  @Post('queue/dead-letter/:id/replay')
  @RequirePermissions('settings.write')
  async replayDeadLetter(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.replayDeadLetter(id, user.organisationId);
  }

  @Post('queue/enqueue')
  @RequirePermissions('settings.write')
  async enqueue(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.enqueue({
      organisationId: user.organisationId,
      idempotencyKey: body?.idempotencyKey || `manual-${Date.now()}-${Math.random()}`,
      channel: body?.channel || 'email',
      provider: body?.provider || 'dev-simulated',
      recipient: body?.recipient ?? { to: body?.to },
      payload: body?.payload ?? { subject: body?.subject, body: body?.body ?? body?.message },
      maxAttempts: body?.maxAttempts,
      priority: body?.priority,
    });
  }

  @Post('queue/process')
  @RequirePermissions('settings.write')
  async processQueue() {
    return this.worker.runOnce();
  }

  @Get('webhooks')
  @RequirePermissions('settings.read')
  async webhooks(@Query() query: any, @CurrentUser() user: AuthenticatedUser) {
    return { data: await this.webhookService.list(user.organisationId, query?.provider) };
  }

  @Get('analytics')
  @RequirePermissions('settings.read')
  async analytics(@CurrentUser() user: AuthenticatedUser) {
    const stats = await this.queue.stats(user.organisationId);
    const rates = await this.queue.providerFailureRates(user.organisationId);
    return { stats, providerFailureRates: rates };
  }

  @Get('device-tokens')
  @RequirePermissions('settings.read')
  async listDeviceTokens(@CurrentUser() user: AuthenticatedUser) {
    return this.database.query(`SELECT * FROM geoventra.push_device_tokens WHERE organisation_id=$1 ORDER BY created_at DESC`, [user.organisationId]);
  }

  @Post('device-tokens')
  @RequirePermissions('settings.write')
  async registerDeviceToken(@Body() body: any, @CurrentUser() user: AuthenticatedUser) {
    const row = await this.database.queryOne<any>(
      `INSERT INTO geoventra.push_device_tokens (organisation_id, user_id, device_token, platform)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (organisation_id, device_token) DO UPDATE SET active=true, updated_at=now()
       RETURNING *`,
      [user.organisationId, body?.userId ?? user.id, body?.token ?? body?.deviceToken, body?.platform ?? 'android'],
    );
    return row;
  }

  @Delete('device-tokens/:token')
  @RequirePermissions('settings.write')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeDeviceToken(@Param('token') token: string, @CurrentUser() user: AuthenticatedUser) {
    await this.database.query(`UPDATE geoventra.push_device_tokens SET active=false, invalidated_at=now(), updated_at=now() WHERE organisation_id=$1 AND device_token=$2`, [user.organisationId, token]);
    return {};
  }
}
