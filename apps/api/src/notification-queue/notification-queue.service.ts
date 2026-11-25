import { Injectable, Logger } from '@nestjs/common';
import { NotificationQueueRepository, type QueueJob } from './notification-queue.repository.js';

export interface EnqueueInput {
  organisationId: string;
  idempotencyKey: string;
  channel: string;
  provider: string;
  recipient?: any;
  payload?: any;
  maxAttempts?: number;
  scheduledAt?: Date;
  priority?: number;
  outboxEventType?: string;
}

@Injectable()
export class NotificationQueueService {
  private readonly logger = new Logger(NotificationQueueService.name);

  constructor(private readonly repository: NotificationQueueRepository) {}

  async enqueue(input: EnqueueInput): Promise<QueueJob | null> {
    const job = await this.repository.enqueue(input);
    if (input.outboxEventType) {
      await this.repository.insertOutbox({
        organisationId: input.organisationId,
        eventType: input.outboxEventType,
        aggregateType: 'notification',
        aggregateId: job?.id,
        payload: { jobId: job?.id, channel: input.channel, provider: input.provider },
      });
    }
    return job;
  }

  async getJob(id: string, organisationId?: string): Promise<QueueJob | null> {
    if (organisationId) return this.repository.findByIdForOrg(id, organisationId);
    return this.repository.findById(id);
  }

  async listJobs(organisationId: string, filters?: any): Promise<any> {
    return this.repository.listJobs(organisationId, filters);
  }

  async stats(organisationId: string): Promise<any> {
    return this.repository.stats(organisationId);
  }

  async providerFailureRates(organisationId: string): Promise<any[]> {
    return this.repository.providerFailureRates(organisationId);
  }

  async retryJob(id: string, organisationId: string): Promise<QueueJob | null> {
    const job = await this.repository.findByIdForOrg(id, organisationId);
    if (!job) return null;
    await this.repository.resetJob(id);
    return this.repository.findById(id);
  }

  async replayDeadLetter(id: string, organisationId: string): Promise<QueueJob | null> {
    return this.retryJob(id, organisationId);
  }

  async recoverStale(staleAfterMs = 60_000): Promise<number> {
    return this.repository.recoverStale(staleAfterMs);
  }

  // expose repository for worker
  get repositoryRef(): NotificationQueueRepository {
    return this.repository;
  }
}
// helper patch: add databaseQuery to repository? We'll instead add method. 
// The above retryJob uses repository.databaseQuery which doesn't exist; fix below by editing repository.
