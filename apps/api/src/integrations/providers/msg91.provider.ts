import type { NotificationProvider, ProviderSendResult } from './provider.interface.js';

export class Msg91SmsProvider implements NotificationProvider {
  readonly name = 'msg91';
  readonly channel = 'sms' as const;
  readonly simulated = false;
  private config: Record<string, unknown> = {};

  configure(config: Record<string, unknown>): void { this.config = { ...config }; }
  isConfigured(): boolean { return !!(this.config.authKey && this.config.senderId); }
  getStatus(): any { return this.isConfigured() ? 'configured' : 'not_configured'; }
  async verify() { return { ok: this.isConfigured() }; }

  async send(input: { to: string | string[]; body: string }): Promise<ProviderSendResult> {
    if (!this.isConfigured()) return { success: false, simulated: false, retryable: false, error: 'MSG91 not configured' };
    const authKey = String(this.config.authKey);
    const sender = String(this.config.senderId);
    const to = Array.isArray(input.to) ? input.to.join(',') : input.to;
    const route = String(this.config.route ?? '4');
    const url = `https://api.msg91.com/api/sendhttp.php?authkey=${encodeURIComponent(authKey)}&mobiles=${encodeURIComponent(to)}&message=${encodeURIComponent(input.body)}&sender=${encodeURIComponent(sender)}&route=${encodeURIComponent(route)}&country=91`;
    try {
      const res = await fetch(url, { method: 'GET' });
      const text = await res.text();
      if (res.ok && !/error/i.test(text)) return { success: true, simulated: false, providerMessageId: text.trim(), raw: text };
      const retryable = res.status >= 500 || res.status === 429;
      return { success: false, simulated: false, retryable, error: `MSG91 ${res.status}: ${text}` };
    } catch (e) {
      return { success: false, simulated: false, retryable: true, error: (e as Error).message };
    }
  }
}