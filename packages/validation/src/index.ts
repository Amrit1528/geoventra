/**
 * GEOVENTRA — shared validation schemas.
 *
 * The canonical schemas live next to the contracts they validate in `@geoventra/contracts`
 * (engine ingestion and history queries). This package re-exports them together with the
 * authentication schemas the API and the web client both need, so cross-cutting callers can
 * validate payloads without duplicating rules.
 */

import { z } from 'zod';

export {
  engineTelemetryReadingInputSchema,
  engineTelemetryIngestSchema,
  engineFreezeFrameInputSchema,
  engineDtcIngestSchema,
  engineDtcActionSchema,
  engineHistoryQuerySchema,
} from '@geoventra/contracts';

/** Login payload accepted by `POST /api/v1/auth/login`. */
export const loginRequestSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'A password is required'),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Refresh token payload accepted by `POST /api/v1/auth/refresh`. */
export const refreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'A refresh token is required'),
});
export type RefreshTokenRequest = z.infer<typeof refreshTokenRequestSchema>;

/** Pagination query parameters for list endpoints. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Generic schema factory producing a validated list query. */
export function makeListQuerySchema<T extends z.ZodRawShape>(shape: T) {
  return paginationQuerySchema.extend(shape);
}
