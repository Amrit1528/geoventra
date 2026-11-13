/**
 * GEOVENTRA — bearer-token authentication guard.
 *
 * Verifies the JWT access token and attaches the principal to `request.user`. Routes marked
 * with `@Public()` are allowed through untouched.
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AccessTokenPayload, AuthenticatedUser } from './authenticated-user.interface.js';

export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  user?: AuthenticatedUser;
  requestId?: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new UnauthorizedException('A bearer access token is required');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('The access token is invalid or has expired');
    }

    if (!payload.sub || !payload.org) {
      throw new UnauthorizedException('The access token is malformed');
    }

    request.user = {
      id: payload.sub,
      organisationId: payload.org,
      name: '',
      email: '',
      role: payload.role,
      roleId: '',
      permissions: payload.perms ?? [],
      avatarUrl: null,
    };
    return true;
  }
}

/** Pull the raw token out of an `Authorization: Bearer <token>` header. */
export function extractBearerToken(header: string | string[] | undefined): string | null {
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}
