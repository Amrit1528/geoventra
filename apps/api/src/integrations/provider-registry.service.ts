import { Injectable } from '@nestjs/common';
import type { NotificationProvider } from './providers/provider.interface.js';
import { SesEmailProvider } from './providers/ses.provider.js';
import { Msg91SmsProvider } from './providers/msg91.provider.js';
import { FcmPushProvider } from './providers/fcm.provider.js';
import { DevNotificationProvider } from './providers/dev.provider.js';

@Injectable()
export class ProviderRegistryService {
  private providers = new Map<string, NotificationProvider>();

  constructor() {
    // real adapters
    this.providers.set('amazon-ses', new SesEmailProvider());
    this.providers.set('msg91', new Msg91SmsProvider());
    this.providers.set('firebase-fcm', new FcmPushProvider());

    // dev providers (disabled in production by default)
    const devEnabled = (process.env.NODE_ENV !== 'production') || (process.env.ENABLE_DEV_PROVIDERS === 'true');
    if (devEnabled) {
      this.providers.set('dev-simulated-email', new DevNotificationProvider('email', (process.env.DEV_PROVIDER_MODE as any) || 'success'));
      this.providers.set('dev-simulated-sms', new DevNotificationProvider('sms', (process.env.DEV_PROVIDER_MODE as any) || 'success'));
      this.providers.set('dev-simulated-push', new DevNotificationProvider('push', (process.env.DEV_PROVIDER_MODE as any) || 'success'));
      // generic alias used by tests
      this.providers.set('dev-simulated', new DevNotificationProvider('email', (process.env.DEV_PROVIDER_MODE as any) || 'success'));
    }
  }

  get(name: string): NotificationProvider | null {
    return this.providers.get(name) ?? null;
  }

  list(): { name: string; channel: string; simulated: boolean; status: string }[] {
    return Array.from(this.providers.entries()).map(([name, p]) => ({
      name,
      channel: p.channel,
      simulated: p.simulated,
      status: p.getStatus(),
    }));
  }

  configure(name: string, config: Record<string, unknown>): boolean {
    const p = this.providers.get(name);
    if (!p) return false;
    p.configure(config);
    return true;
  }

  getForJob(job: { provider: string; channel: string }): NotificationProvider | null {
    const p = this.get(job.provider);
    if (p) return p;
    // fallback to dev provider by channel
    const devName = `dev-simulated-${job.channel === 'email' ? 'email' : job.channel === 'sms' ? 'sms' : 'push'}`;
    return this.get(devName);
  }
}
