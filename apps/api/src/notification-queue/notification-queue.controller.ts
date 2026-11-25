import { Body, Controller, Get, Param, Post, Query, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RequirePermissions } from '../common/auth/permissions.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import type { AuthenticatedUser } from '../common/auth/authenticated-user.interface.js';
import { NotificationQueueService } from './notification-queue.service.js';
import { NotificationWorkerService } from './notification-worker.service.js';

@Controller('notifications/queue')
@UseGuards(JwtAuthGuard)
export class NotificationQueueController {
  constructor(private readonly queue: NotificationQueueService, private readonly worker: NotificationWorkerService) {}

  @Get('stats')
  @RequirePermissions('settings.read')
  async stats(@CurrentUser() user: AuthenticatedUser) {
    return this.queue.stats(user.organisationId);
  }

  @Get('jobs')
  @RequirePermissions('settings.read')
  async jobs(@Query() query: any, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.listJobs(user.organisationId, {
      status: query?.status,
      channel: query?.channel,
      page: query?.page ? Number(query.page) : 1,
      pageSize: query?.pageSize ? Number(query.pageSize) : 50,
    });
  }

  @Post('jobs/:id/retry')
  @RequirePermissions('settings.write')
  async retry(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.queue.retryJob(id, user.organisationId);
  }

  @Post('process')
  @RequirePermissions('settings.write')
  async process() {
    return this.worker.runOnce();
  }

  @Post('enqueue')
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
    });
  }
}
