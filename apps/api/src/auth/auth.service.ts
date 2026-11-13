/**
 * GEOVENTRA — authentication service.
 *
 * Issues short-lived JWT access tokens and rotating, hashed refresh tokens. The permission
 * set is resolved from the role/permission tables on every request so a role change takes
 * effect immediately instead of waiting for a token to expire.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'node:crypto';
import type {
  AuthSession,
  AuthUser,
  OrganisationSummary,
  Permission,
  RoleName,
} from '@geoventra/contracts';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { PasswordService } from '../common/auth/password.service.js';
import type { AccessTokenPayload } from '../common/auth/authenticated-user.interface.js';

interface UserRow {
  id: string;
  organisation_id: string;
  name: string;
  email: string;
  phone: string | null;
  password_hash: string;
  status: string;
  avatar_url: string | null;
  role_id: string;
  role_name: RoleName;
}

interface OrganisationRow {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  country: string;
  logo_url: string | null;
  created_at: Date;
}

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.JWT_ACCESS_TTL_SECONDS ?? 900);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.JWT_REFRESH_TTL_SECONDS ?? 60 * 60 * 24 * 14);

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
  ) {}

  /** Exchange credentials for an access + refresh token pair. */
  async login(email: string, password: string): Promise<AuthSession> {
    const row = await this.loadUserByEmail(email);
    if (!row) {
      throw new UnauthorizedException('The email or password is incorrect');
    }
    if (row.status !== 'active') {
      throw new UnauthorizedException('This account is not active');
    }

    const valid = await this.passwordService.verify(password, row.password_hash);
    if (!valid) {
      throw new UnauthorizedException('The email or password is incorrect');
    }

    const permissions = await this.loadPermissions(row.role_id);
    const session = await this.issueSession(row, permissions);
    await this.database.query('UPDATE geoventra.users SET last_login_at = now() WHERE id = $1', [row.id]);
    return session;
  }

  /** Rotate a refresh token and issue a new access token. */
  async refresh(refreshToken: string): Promise<AuthSession> {
    const tokenHash = hashToken(refreshToken);
    const row = await this.database.queryOne<{
      id: string;
      user_id: string;
      organisation_id: string;
      expires_at: Date;
      revoked_at: Date | null;
    }>(
      `SELECT id, user_id, organisation_id, expires_at, revoked_at
         FROM geoventra.refresh_tokens
        WHERE token_hash = $1`,
      [tokenHash],
    );

    if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedException('The refresh token is invalid or has expired');
    }

    const user = await this.loadUserById(row.user_id);
    if (!user || user.status !== 'active') {
      throw new UnauthorizedException('This account is not active');
    }

    const permissions = await this.loadPermissions(user.role_id);
    await this.database.query(
      'UPDATE geoventra.refresh_tokens SET revoked_at = now() WHERE id = $1',
      [row.id],
    );
    return this.issueSession(user, permissions);
  }

  /** Revoke a refresh token. Safe to call with an unknown token. */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    await this.database.query(
      'UPDATE geoventra.refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [hashToken(refreshToken)],
    );
  }

  /** Resolve the full principal for an access token. */
  async resolveUser(userId: string): Promise<AuthUser> {
    const row = await this.loadUserById(userId);
    if (!row) {
      throw new UnauthorizedException('The account no longer exists');
    }
    const permissions = await this.loadPermissions(row.role_id);
    return {
      id: row.id,
      organisationId: row.organisation_id,
      name: row.name,
      email: row.email,
      role: row.role_name,
      roleId: row.role_id,
      permissions,
      avatarUrl: row.avatar_url,
    };
  }

  private async issueSession(row: UserRow, permissions: Permission[]): Promise<AuthSession> {
    const payload: AccessTokenPayload = {
      sub: row.id,
      org: row.organisation_id,
      role: row.role_name,
      perms: permissions,
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    const refreshToken = randomBytes(48).toString('hex');
    await this.database.query(
      `INSERT INTO geoventra.refresh_tokens
         (organisation_id, user_id, token_hash, expires_at)
       VALUES ($1, $2, $3, now() + ($4 || ' seconds')::interval)`,
      [row.organisation_id, row.id, hashToken(refreshToken), String(REFRESH_TOKEN_TTL_SECONDS)],
    );

    const organisation = await this.loadOrganisation(row.organisation_id);
    const user: AuthUser = {
      id: row.id,
      organisationId: row.organisation_id,
      name: row.name,
      email: row.email,
      role: row.role_name,
      roleId: row.role_id,
      permissions,
      avatarUrl: row.avatar_url,
    };

    return {
      accessToken,
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      user,
      organisation,
    };
  }

  private async loadUserByEmail(email: string): Promise<UserRow | null> {
    return this.database.queryOne<UserRow>(
      `SELECT u.id, u.organisation_id, u.name, u.email, u.phone, u.password_hash, u.status,
              u.avatar_url, u.role_id, r.name AS role_name
         FROM geoventra.users u
         JOIN geoventra.roles r ON r.id = u.role_id
        WHERE lower(u.email) = lower($1)
          AND u.deleted_at IS NULL`,
      [email],
    );
  }

  private async loadUserById(userId: string): Promise<UserRow | null> {
    return this.database.queryOne<UserRow>(
      `SELECT u.id, u.organisation_id, u.name, u.email, u.phone, u.password_hash, u.status,
              u.avatar_url, u.role_id, r.name AS role_name
         FROM geoventra.users u
         JOIN geoventra.roles r ON r.id = u.role_id
        WHERE u.id = $1
          AND u.deleted_at IS NULL`,
      [userId],
    );
  }

  private async loadPermissions(roleId: string): Promise<Permission[]> {
    const rows = await this.database.query<{ code: Permission }>(
      `SELECT p.code
         FROM geoventra.role_permissions rp
         JOIN geoventra.permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = $1
        ORDER BY p.code`,
      [roleId],
    );
    return rows.map((row) => row.code);
  }

  private async loadOrganisation(organisationId: string): Promise<OrganisationSummary> {
    const row = await this.database.queryOne<OrganisationRow>(
      `SELECT id, name, slug, timezone, currency, country, logo_url, created_at
         FROM geoventra.organisations
        WHERE id = $1`,
      [organisationId],
    );
    if (!row) {
      throw new UnauthorizedException('The organisation no longer exists');
    }
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      timezone: row.timezone,
      currency: row.currency,
      country: row.country,
      logoUrl: row.logo_url,
      createdAt: row.created_at.toISOString(),
    };
  }
}

/** Refresh tokens are stored as a SHA-256 digest — the raw token never touches the disk. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
