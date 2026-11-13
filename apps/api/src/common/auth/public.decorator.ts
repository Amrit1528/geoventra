/**
 * GEOVENTRA — marks a route as reachable without a bearer token.
 *
 * Used by the auth endpoints themselves and by the telemetry ingestion routes, which are
 * authenticated with the shared ingest key instead of a user session.
 */

import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'geoventra:isPublic';
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
