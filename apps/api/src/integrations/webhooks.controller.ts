import { Body, Controller, Headers, Post, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { Public } from '../common/auth/public.decorator.js';
import { WebhookService } from './webhook.service.js';
import { CredentialService } from './credential.service.js';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService, private readonly credentials: CredentialService) {}

  @Post('ses')
  @Public()
  @HttpCode(HttpStatus.OK)
  async ses(@Body() body: any, @Headers() headers: any, @Query('secret') secret?: string) {
    // optional shared secret
    const configuredSecret = process.env.WEBHOOK_SECRET;
    let signatureValid: boolean | null = null;
    if (configuredSecret) {
      signatureValid = (headers['x-webhook-secret'] || secret) === configuredSecret;
      if (!signatureValid) {
        const rec = await this.webhooks.recordEvent({ provider: 'amazon-ses', dedupeKey: `ses:rejected:${Date.now()}`, payload: body, signatureValid: false });
        await this.webhooks.markProcessed(rec.id, 'rejected', 'invalid signature');
        return { ok: false, error: 'invalid signature' };
      }
    }
    return this.webhooks.handleSes(body);
  }

  @Post('msg91')
  @Public()
  @HttpCode(HttpStatus.OK)
  async msg91(@Body() body: any, @Headers() headers: any, @Query('secret') secret?: string) {
    const configuredSecret = process.env.WEBHOOK_SECRET;
    if (configuredSecret) {
      const sig = headers['x-msg91-signature'] || headers['x-webhook-secret'] || secret;
      const valid = (sig === configuredSecret) || this.webhooks.validateHmac(configuredSecret, JSON.stringify(body), sig);
      if (!valid) {
        const rec = await this.webhooks.recordEvent({ provider: 'msg91', dedupeKey: `msg91:rejected:${Date.now()}`, payload: body, signatureValid: false });
        await this.webhooks.markProcessed(rec.id, 'rejected', 'invalid signature');
        return { ok: false, error: 'invalid signature' };
      }
    }
    return this.webhooks.handleMsg91(body);
  }

  @Post('fcm')
  @Public()
  @HttpCode(HttpStatus.OK)
  async fcm(@Body() body: any, @Headers() headers: any, @Query('secret') secret?: string) {
    const configuredSecret = process.env.WEBHOOK_SECRET;
    if (configuredSecret) {
      const sig = headers['x-webhook-secret'] || secret;
      if (sig !== configuredSecret) {
        const rec = await this.webhooks.recordEvent({ provider: 'firebase-fcm', dedupeKey: `fcm:rejected:${Date.now()}`, payload: body, signatureValid: false });
        await this.webhooks.markProcessed(rec.id, 'rejected', 'invalid signature');
        return { ok: false, error: 'invalid signature' };
      }
    }
    return this.webhooks.handleFcm(body);
  }
}
