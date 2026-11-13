/**
 * GEOVENTRA — password hashing.
 *
 * The platform stores `scrypt$<saltHex>$<hashHex>` credentials:
 *
 *   salt — 16 random bytes, hex encoded (32 characters)
 *   hash — 64 bytes derived with scrypt(N=16384, r=8, p=1), hex encoded (128 characters)
 *
 * The format is intentionally self-describing so the cost parameters can be raised later
 * without invalidating existing credentials.
 */

import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

@Injectable()
export class PasswordService {
  /** Derive a new hash for a plaintext password using a fresh random salt. */
  async hash(plaintext: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const derived = await this.derive(plaintext, salt);
    return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
  }

  /** Verify a plaintext password against a stored `scrypt$…` credential. */
  async verify(plaintext: string, stored: string): Promise<boolean> {
    if (typeof stored !== 'string') return false;
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [algorithm, saltHex, hashHex] = parts;
    if (algorithm !== 'scrypt' || !saltHex || !hashHex) return false;

    let saltHexDecoded: Buffer;
    let expected: Buffer;
    try {
      saltHexDecoded = Buffer.from(saltHex, 'hex');
      expected = Buffer.from(hashHex, 'hex');
    } catch {
      return false;
    }
    if (expected.length !== KEY_LENGTH) return false;

    // Two salt encodings are supported: the legacy seed implementation used the hex string's
    // UTF-8 bytes as the salt, the current implementation uses the decoded bytes. Both are
    // accepted so existing credentials keep working.
    const hexBytesMatch =
      saltHexDecoded.length === SALT_LENGTH &&
      timingSafeEqual(await this.derive(plaintext, saltHexDecoded), expected);
    if (hexBytesMatch) return true;

    const utf8Match =
      timingSafeEqual(await this.derive(plaintext, Buffer.from(saltHex, 'utf8')), expected);
    return utf8Match;
  }

  private derive(plaintext: string, salt: Buffer): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      scrypt(
        plaintext,
        salt,
        KEY_LENGTH,
        { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 128 * 1024 * 1024 },
        (error, derived) => {
          if (error) reject(error);
          else resolve(derived);
        },
      );
    });
  }
}
