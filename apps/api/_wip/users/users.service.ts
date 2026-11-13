/**
 * GEOVENTRA — user service.
 *
 * Handles all business logic related to user lifecycle, roles, and permissions.
 * Relies on the common database and authentication services.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';
import { AuthService } from '../auth/auth.service.js';
import type { UserSummary, RoleName, UserStatus } from '@geoventra/contracts';
import type { Paginated } from '@geoventra/contracts';

@Injectable()
export class UsersService {
  constructor(
    private readonly database: DatabaseService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Retrieves a paginated list of users with filtering and searching capabilities.
   * @param query - Query parameters (search, role, status, fleetId, page, pageSize).
   * @returns A paginated list of user summaries.
   */
  async findAllUsers(query: { search?: string; role?: RoleName; status?: UserStatus; fleetId?: string; page: number; pageSize: number }): Promise<Paginated<UserSummary>> {
    // Implementation should build dynamic WHERE clauses based on query parameters.
    // Use the existing geoventra.users table and JOIN with geoventra.roles.
    const { search, role, status, fleetId, page, pageSize } = query;

    let sql = `
      SELECT u.id, u.name, u.email, u.phone, u.role_name, u.status, u.last_login_at, u.created_at
      FROM geoventra.users u
      JOIN geoventra.roles r ON r.id = u.role_id
      WHERE u.deleted_at IS NULL
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (search) {
      sql += ` AND (u.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    if (role) {
      sql += ` AND u.role_name = $${paramIndex}`;
      params.push(role);
      paramIndex++;
    }
    if (status) {
      sql += ` AND u.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    if (fleetId) {
      sql += ` AND u.fleet_id = $${paramIndex}`; // Assuming fleet_id exists on geoventra.users
      params.push(fleetId);
      paramIndex++;
    }

    // Pagination logic
    const offset = (page - 1) * pageSize;
    sql += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(pageSize);
    params.push(offset);

    // Count query for pagination metadata
    const countSql = sql.replace('LIMIT $'+paramIndex+' OFFSET $'+(paramIndex+1), 'SELECT COUNT(*) FROM geoventra.users u JOIN geoventra.roles r ON r.id = u.role_id WHERE u.deleted_at IS NULL' + (sql.match(/WHERE/g) || []).slice(1).map(clause => ` AND ${clause}`).join(''));

    const [users, total] = await this.database.queryAndCount(sql, params);

    return {
      data: users as UserSummary[],
      meta: {
        page: page,
        pageSize: pageSize,
        total: total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Creates a new user and optionally sends an invitation email.
   * @param userData - Data for the new user.
   * @param isInvitation - If true, the user is not active yet and an invite email should be sent.
   */
  async createUser(userData: { name: string; email: string; password: string; roleId: string; organisationId: string; fleetId?: string; isInvitation: boolean }): Promise<UserSummary> {
    // 1. Hash password
    const passwordHash = await this.authService.passwordService.hash(userData.password);

    // 2. Insert user (status is 'invited' if isInvitation is true, 'active' otherwise)
    const initialStatus = userData.isInvitation ? 'invited' : 'active';

    const result = await this.database.query(
      `INSERT INTO geoventra.users (name, email, password_hash, role_id, organisation_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING id, name, email, phone, role_name, status, last_login_at, created_at`,
      [userData.name, userData.email, passwordHash, userData.roleId, userData.organisationId, initialStatus],
    );

    const newUserSummary = result[0] as UserSummary;

    // 3. Handle invitation if required
    if (userData.isInvitation) {
      // Assume an existing email sending utility/service
      await this.sendInvitationEmail(newUserSummary);
    }

    return newUserSummary;
  }

  /**
   * Handles updating a user's details, role, or status.
   */
  async updateUser(userId: string, updates: Partial<Omit<UserSummary, 'id' | 'created_at'>>): Promise<UserSummary> {
    // Update fields and return the refreshed summary
    const updatedUser = await this.database.queryOne<UserSummary>(
      `UPDATE geoventra.users SET $1 = $2, $3 = $4, $5 = $6, updated_at = now()
       RETURNING id, name, email, phone, role_name, status, last_login_at, created_at`,
      [userId, updates.name, updates.phone, updates.role_id, updates.status, updates.avatarUrl]
    );

    return updatedUser;
  }

  /**
   * Helper to send the actual invitation email.
   */
  private async sendInvitationEmail(user: UserSummary): Promise<void> {
    // Integration point for existing email infrastructure (e.g., SendGrid, AWS SES)
    console.log(`[INVITE] Sending invitation to ${user.email} for GEOVENTRA.`);
    // Placeholder for actual email sending logic
  }
}