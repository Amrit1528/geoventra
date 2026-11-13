/**
 * GEOVENTRA — requires one or more permissions on the authenticated principal.
 *
 * Usage: `@RequirePermissions('engine.read', 'engine.write')`
 */

import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@geoventra/contracts';

export const PERMISSIONS_KEY = 'geoventra:permissions';
export const RequirePermissions = (...permissions: Permission[]): MethodDecorator &
  ClassDecorator => SetMetadata(PERMISSIONS_KEY, permissions);
