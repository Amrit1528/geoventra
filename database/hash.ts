/**
 * GEOVENTRA — password hashing helpers.
 *
 * The database stores password hashes in the `scrypt$<saltHex>$<hashHex>` format:
 * a 16 byte random salt and a 64 byte derived key, both hex encoded. The same
 * format is used by the API, so the seed script and the migration runner share
 * this module instead of re-implementing the derivation.
 */

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const ALGORITHM = 'scrypt';
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELISM = 1;

const SCRYPT_OPTIONS = {
  N: SCRYPT_COST,
  r: SCRYPT_BLOCK_SIZE,
  p: SCRYPT_PARALLELISM,
} as const;

/** Derives a scrypt key for the given password and salt. */
function derive(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, KEY_LENGTH, { ...SCRYPT_OPTIONS });
}

/**
 * Hashes a plain text password.
 *
 * The returned value is `scrypt$<saltHex>$<hashHex>` where the salt is 16
 * random bytes and the derived key is 64 bytes, both hex encoded.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH);
  const key = derive(password, salt);
  return `${ALGORITHM}$${salt.toString('hex')}$${key.toString('hex')}`;
}

/**
 * Verifies a plain text password against a stored hash.
 *
 * Returns `false` for malformed or unknown hash formats instead of throwing so
 * that a corrupted row can never crash an authentication path.
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3) {
    return false;
  }

  const [algorithm, saltHex, keyHex] = parts;
  if (algorithm !== ALGORITHM || saltHex === undefined || keyHex === undefined) {
    return false;
  }

  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(keyHex, 'hex');
  if (keyHex.length !== 128 || expected.length !== KEY_LENGTH) {
    return false;
  }

  // Two salt encodings are supported: the legacy seed implementation used the
  // hex string's UTF-8 bytes as the salt; the current one uses the decoded
  // bytes. Both are accepted so existing credentials keep working.
  if (salt.length === SALT_LENGTH && timingSafeEqual(derive(password, salt), expected)) {
    return true;
  }
  return timingSafeEqual(derive(password, Buffer.from(saltHex, 'utf8')), expected);
}
