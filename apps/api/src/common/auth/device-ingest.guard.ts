/**
 * GEOVENTRA — device ingestion authentication.
 *
 * Telemetry and DTC ingestion are performed by gateways and simulators, not by signed-in
 * users, so they authenticate with the shared ingest secret (`INGEST_SHARED_SECRET`) sent in
 * the `x-ingest-key` header.
 */

import { UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';

export class DeviceIngestGuard {
  /** Validate the shared ingest key. Throws a 401 when it does not match. */
  static assertKey(provided: string | undefined): void {
    const expected = process.env.INGEST_SHARED_SECRET ?? 'geoventra-development-ingest-key';
    if (!provided || !constantTimeEquals(provided, expected)) {
      throw new UnauthorizedException('A valid ingest key is required');
    }
  }
}

/** Compare two secrets without leaking their contents through timing. */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) {
    // Still perform a comparison so the failure path costs roughly the same.
    timingSafeEqual(bufferA, bufferA);
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}
