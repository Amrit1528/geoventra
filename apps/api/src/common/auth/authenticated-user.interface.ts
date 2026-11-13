/**
 * GEOVENTRA — authenticated principal.
 *
 * The shape mirrors `AuthUser` in `@geoventra/contracts` but is resolved server-side, so it
 * carries the organisation id used for tenant scoping on every query.
 */

import type { Permission, RoleName } from '@geoventra/contracts';

export interface AuthenticatedUser {
  id: string;
  organisationId: string;
  name: string;
  email: string;
  role: RoleName;
  roleId: string;
  permissions: Permission[];
  avatarUrl: string | null;
}

export interface AccessTokenPayload {
  /** User id. */
  sub: string;
  /** Organisation id — the tenant boundary for every query. */
  org: string;
  /** Role name. */
  role: RoleName;
  /** Permission codes granted to the role. */
  perms: Permission[];
  /** Issued-at (seconds). */
  iat?: number;
  /** Expiry (seconds). */
  exp?: number;
}
