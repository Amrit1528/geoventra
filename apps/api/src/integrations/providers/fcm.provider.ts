import crypto from 'node:crypto';
import type { NotificationProvider, ProviderSendResult } from './provider.interface.js';

export class FcmPushProvider implements NotificationProvider {
  readonly name = 'firebase-fcm';
  readonly channel = 'push' as const;
  readonly simulated = false;
  private config: Record<string, unknown> = {};

  configure(config: Record<string, unknown>): void { this.config = { ...config }; }
  isConfigured(): boolean {
    return !!(this.config.projectId && this.config.clientEmail && this.config.privateKey);
  }
  getStatus(): any { return this.isConfigured() ? 'configured' : 'not_configured'; }
  async verify() { return { ok: this.isConfigured() }; }

  private async getAccessToken(): Promise<string> {
    const clientEmail = String(this.config.clientEmail);
    const privateKey = String(this.config.privateKey).replace(/\\n/g, '\n');
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })).toString('base64url');
    const signingInput = `${header}.${payload}`;
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(signingInput);
    const signature = sign.sign(privateKey, 'base64url');
    const jwt = `${signingInput}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt,
      }),
    });
    const json = await res.json() as any;
    if (!res.ok) throw new Error(`FCM token error: ${JSON.stringify(json)}`);
    return json.access_token;
  }

  async send(input: { to: string | string[]; body: string; title?: string }): Promise<ProviderSendResult> {
    if (!this.isConfigured()) return { success: false, simulated: false, retryable: false, error: 'FCM not configured' };
    const projectId = String(this.config.projectId);
    const tokens = Array.isArray(input.to) ? input.to : [input.to];
    try {
      const accessToken = await this.getAccessToken();
      let lastId: string | undefined;
      for (const token of tokens) {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: input.title ?? 'Notification', body: input.body },
            },
          }),
        });
        const json = await res.json() as any;
        if (!res.ok) {
          const retryable = res.status >= 500 || res.status === 429;
          // invalid token handling
          const errCode = json?.error?.details?.[0]?.errorCode || json?.error?.status;
          if (errCode === 'UNREGISTERED' || errCode === 'INVALID_ARGUMENT') {
            // mark token invalid externally? best-effort: leave to caller
          }
          return { success: false, simulated: false, retryable, error: `FCM ${res.status}: ${JSON.stringify(json)}` };
        }
        lastId = json?.name;
      }
      return { success: true, simulated: false, providerMessageId: lastId };
    } catch (e) {
      return { success: false, simulated: false, retryable: true, error: (e as Error).message };
    }
  }
}