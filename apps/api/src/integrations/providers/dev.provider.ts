import type { NotificationProvider, ProviderSendResult } from './provider.interface.js';

export type DevMode = 'success' | 'temporary_failure' | 'permanent_failure' | 'rate_limit' | 'timeout';

export class DevNotificationProvider implements NotificationProvider {
  readonly name = 'dev-simulated';
  readonly channel: 'email' | 'sms' | 'push';
  readonly simulated = true;
  private mode: DevMode = 'success';
  private configured = true;

  constructor(channel: 'email' | 'sms' | 'push', mode: DevMode = 'success') {
    this.channel = channel;
    this.mode = mode;
  }

  configure(config: Record<string, unknown>): void {
    if (typeof config.mode === 'string') this.mode = config.mode as DevMode;
    if (typeof config.enabled === 'boolean') this.configured = config.enabled;
  }

  isConfigured(): boolean { return this.configured; }
  getStatus(): any { return this.configured ? 'configured' : 'disabled'; }

  async send(): Promise<ProviderSendResult> {
    const label = 'SIMULATED';
    switch (this.mode) {
      case 'success':
        return { success: true, simulated: true, providerMessageId: `sim-${Date.now()}`, raw: { label } };
      case 'temporary_failure':
        return { success: false, simulated: true, retryable: true, error: `${label}: temporary provider failure` };
      case 'permanent_failure':
        return { success: false, simulated: true, retryable: false, error: `${label}: permanent provider failure` };
      case 'rate_limit':
        return { success: false, simulated: true, retryable: true, error: `${label}: rate limit exceeded` };
      case 'timeout':
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { success: false, simulated: true, retryable: true, error: `${label}: timeout` };
      default:
        return { success: true, simulated: true, providerMessageId: `sim-${Date.now()}` };
    }
  }
}