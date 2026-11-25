/**
 * GEOVENTRA — permission guard.
 *
 * Runs after the JWT guard and enforces the `@RequirePermissions(...)` metadata. A principal
 * without the requested permission receives a 403.
 */

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Inject } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './permissions.decorator.js';
import type { Permission } from '@geoventra/contracts';
import type { AuthenticatedRequest } from './jwt-auth.guard.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      throw new ForbiddenException('Authentication is required for this operation');
    }

    const granted = new Set(user.permissions);
    const missing = required.filter((permission) => !granted.has(permission));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
