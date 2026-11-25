import crypto from 'node:crypto';
import type { NotificationProvider, ProviderSendResult } from './provider.interface.js';

export class SesEmailProvider implements NotificationProvider {
  readonly name = 'amazon-ses';
  readonly channel = 'email' as const;
  readonly simulated = false;
  private config: Record<string, unknown> = {};

  configure(config: Record<string, unknown>): void { this.config = { ...config }; }
  isConfigured(): boolean {
    return !!(this.config.accessKeyId && this.config.secretAccessKey && this.config.region && this.config.senderEmail);
  }
  getStatus(): any { return this.isConfigured() ? 'configured' : 'not_configured'; }

  async verify(): Promise<{ ok: boolean; message?: string }> {
    return { ok: this.isConfigured(), message: this.isConfigured() ? 'configured' : 'missing credentials' };
  }

  async send(input: { to: string | string[]; subject?: string; body: string }): Promise<ProviderSendResult> {
    if (!this.isConfigured()) return { success: false, simulated: false, retryable: false, error: 'SES not configured' };
    const region = String(this.config.region);
    const accessKeyId = String(this.config.accessKeyId);
    const secretAccessKey = String(this.config.secretAccessKey);
    const sender = String(this.config.senderEmail);
    const to = Array.isArray(input.to) ? input.to : [input.to];
    const host = `email.${region}.amazonaws.com`;
    const path = '/v2/email/outbound-emails';
    const body = JSON.stringify({
      FromEmailAddress: sender,
      Destination: { ToAddresses: to },
      Content: {
        Simple: {
          Subject: { Data: input.subject ?? 'Notification' },
          Body: { Text: { Data: input.body } },
        },
      },
    });
    try {
      const auth = this.sign(region, host, path, body, accessKeyId, secretAccessKey);
      const res = await fetch(`https://${host}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body,
      });
      const text = await res.text();
      let json: any = null;
      try { json = JSON.parse(text); } catch {}
      if (res.ok) return { success: true, simulated: false, providerMessageId: json?.MessageId, raw: json };
      const retryable = res.status >= 500 || res.status === 429;
      return { success: false, simulated: false, retryable, error: `SES ${res.status}: ${text}` };
    } catch (e) {
      return { success: false, simulated: false, retryable: true, error: (e as Error).message };
    }
  }

  private sign(region: string, host: string, path: string, body: string, accessKeyId: string, secretAccessKey: string): Record<string, string> {
    const service = 'ses';
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const canonicalRequest = ['POST', path, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const kDate = crypto.createHmac('sha256', `AWS4${secretAccessKey}`).update(dateStamp).digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
    const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request').digest();
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
    const authorization = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    return { 'X-Amz-Date': amzDate, Authorization: authorization };
  }
}