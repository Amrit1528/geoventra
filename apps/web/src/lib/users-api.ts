/**
 * GEOVENTRA — user API client.
 *
 * Typed functions for user lifecycle management, roles, and permissions.
 * Follows the same pattern as `track-api.ts`.
 */

import type { UserSummary, RoleName, UserStatus } from '@geoventra/contracts';
import { apiRequest, type QueryParams } from './api'; // Assumes a shared frontend API utility
import type { PaginationMeta } from '@geoventra/contracts';

// ── User Management ─────────────────────────────────────────────────────

export type UsersQuery = {
  search?: string;
  role?: RoleName;
  status?: UserStatus;
  fleetId?: string;
  page?: number;
  pageSize?: number;
};

export function buildUsersQuery(query: UsersQuery = {}): QueryParams {
  return {
    search: query.search,
    role: query.role,
    status: query.status,
    fleetId: query.fleetId,
    page: query.page,
    pageSize: query.pageSize,
  };
}

/** List all users in the organization. */
export async function fetchUsers(query: UsersQuery = {}): Promise<{ data: UserSummary[]; meta: PaginationMeta }> {
  return apiRequest< { data: UserSummary[]; meta: PaginationMeta } >('/users', { query: buildUsersQuery(query) });
}

/** Create a new user and optionally send an invitation. */
export async function createUser(input: { name: string; email: string; password: string; roleId: string; organisationId: string; fleetId?: string; isInvitation: boolean }): Promise<UserSummary> {
  return apiRequest<UserSummary>('/users', { method: 'POST', body: input });
}

/** Update an existing user's profile, role, or status. */
export async function updateUser(userId: string, input: Partial<any>): Promise<UserSummary> {
  return apiRequest<UserSummary>(`/users/${userId}/profile`, { method: 'PATCH', body: input });
}

// ── Types Re-export ──────────────────────────────────────────────────────────
export type { UserSummary, RoleName, UserStatus } from '@geoventra/contracts';
