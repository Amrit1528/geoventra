import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { NotificationQueueRepository } from './notification-queue.repository.js';
import { NotificationQueueService } from './notification-queue.service.js';
import type { NotificationProvider } from '../integrations/providers/provider.interface.js';

export interface WorkerDeps {
  getProvider: (job: { provider: string; channel: string }) => NotificationProvider | null;
}

@Injectable()
export class NotificationWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorkerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private deps: WorkerDeps | null = null;

  constructor(
    private readonly repository: NotificationQueueRepository,
    private readonly queue: NotificationQueueService,
  ) {}

  setDeps(deps: WorkerDeps): void {
    this.deps = deps;
  }

  onModuleInit(): void {
    const enabled = (process.env.NOTIFICATION_WORKER_ENABLED ?? 'true').toLowerCase() === 'true';
    if (!enabled) return;
    const interval = Number(process.env.NOTIFICATION_WORKER_INTERVAL_MS ?? 2000);
    this.timer = setInterval(() => { void this.runOnce(); }, interval);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(batchSize = 10): Promise<{ processed: number }> {
    if (this.running) return { processed: 0 };
    this.running = true;
    try {
      await this.repository.recoverStale(Number(process.env.NOTIFICATION_STALE_AFTER_MS ?? 60000));
      const jobs = await this.repository.claimBatch(`worker-${process.pid}`, batchSize);
      const concurrency = Number(process.env.NOTIFICATION_WORKER_CONCURRENCY ?? 4);
      let processed = 0;
      // process in chunks
      for (let i = 0; i < jobs.length; i += concurrency) {
        const chunk = jobs.slice(i, i + concurrency);
        await Promise.allSettled(chunk.map((job) => this.processJob(job)));
        processed += chunk.length;
      }
      return { processed };
    } finally {
      this.running = false;
    }
  }

  private async processJob(job: any): Promise<void> {
    const provider = this.deps?.getProvider(job) ?? null;
    if (!provider) {
      await this.repository.markDeadLetter(job.id, `No provider registered for ${job.provider}`);
      return;
    }
    if (!provider.isConfigured() && !provider.simulated) {
      // allow unconfigured real providers to fail; dev provider always configured
    }
    try {
      const result = await provider.send({
        to: job.recipient?.to ?? job.recipient,
        subject: job.payload?.subject,
        body: job.payload?.body ?? job.payload?.message ?? '',
        template: job.payload?.template,
        metadata: job.payload?.metadata,
      });
      if (result.success) {
        await this.repository.markDelivered(job.id, result.providerMessageId, result.simulated);
        return;
      }
      const attempts = job.attempts; // already incremented
      if (result.retryable && attempts < job.max_attempts) {
        const delay = this.backoff(attempts);
        await this.repository.markRetry(job.id, result.error ?? 'provider failure', new Date(Date.now() + delay));
      } else {
        await this.repository.markDeadLetter(job.id, result.error ?? 'permanent failure');
      }
    } catch (error) {
      const attempts = job.attempts;
      const msg = (error as Error).message;
      if (attempts < job.max_attempts) {
        const delay = this.backoff(attempts);
        await this.repository.markRetry(job.id, msg, new Date(Date.now() + delay));
      } else {
        await this.repository.markDeadLetter(job.id, msg);
      }
    }
  }

  private backoff(attempts: number): number {
    const base = Number(process.env.NOTIFICATION_RETRY_BASE_MS ?? 1000);
    const cap = Number(process.env.NOTIFICATION_RETRY_CAP_MS ?? 60000);
    const exp = Math.min(cap, base * Math.pow(2, Math.max(0, attempts - 1)));
    const jitter = exp * (0.8 + Math.random() * 0.4);
    return Math.round(jitter);
  }
}
