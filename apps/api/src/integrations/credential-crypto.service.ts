import { Injectable, Logger } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Authenticated encryption (AES-256-GCM) for provider credentials.
 * Master key is sourced from NOTIFICATION_MASTER_KEY (or falls back to a
 * development-only default that must never be used in production).
 */
@Injectable()
export class CredentialCryptoService {
  private readonly logger = new Logger(CredentialCryptoService.name);
  private readonly algorithm = 'aes-256-gcm';

  private currentVersion(): number {
    return Number(process.env.NOTIFICATION_MASTER_KEY_VERSION ?? 1);
  }

  private getMasterKey(version = 1): Buffer {
    const envName = version === 1
      ? (process.env.NOTIFICATION_MASTER_KEY ? 'NOTIFICATION_MASTER_KEY' : 'CREDENTIAL_MASTER_KEY')
      : `NOTIFICATION_MASTER_KEY_V${version}`;
    const raw = process.env[envName] ?? process.env.NOTIFICATION_MASTER_KEY ?? process.env.CREDENTIAL_MASTER_KEY ?? 'geoventra-dev-master-key-change-me';
    return scryptSync(raw, `geoventra-credential-salt-v${version}`, 32);
  }

  encrypt(plaintext: string, keyVersion?: number): string {
    const version = keyVersion ?? this.currentVersion();
    const key = this.getMasterKey(version);
    const iv = randomBytes(12);
    const cipher = createCipheriv(this.algorithm, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    const payload = {
      v: version,
      iv: iv.toString('base64'),
      tag: tag.toString('base64'),
      data: ciphertext.toString('base64'),
    };
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }

  decrypt(blob: string): { plaintext: string; keyVersion: number } {
    const payload = JSON.parse(Buffer.from(blob, 'base64').toString('utf8')) as {
      v: number; iv: string; tag: string; data: string;
    };
    const key = this.getMasterKey(payload.v ?? 1);
    const decipher = createDecipheriv(this.algorithm, key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plaintext = decipher.update(Buffer.from(payload.data, 'base64')) + decipher.final('utf8');
    return { plaintext, keyVersion: payload.v ?? 1 };
  }

  mask(config: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(config)) {
      if (typeof v === 'string' && /secret|password|token|key|api/i.test(k)) {
        out[k] = v.length <= 4 ? '****' : `${v.slice(0, 2)}****${v.slice(-2)}`;
      } else if (typeof v === 'object' && v !== null) {
        out[k] = this.mask(v as Record<string, unknown>);
      } else {
        out[k] = v;
      }
    }
    return out;
  }
}