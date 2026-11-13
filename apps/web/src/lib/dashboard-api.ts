/**
 * GEOVENTRA — dashboard metrics API client.
 *
 * Aggregates high-level metrics from various backend services for the dashboard view.
 */

import type { DashboardSummary } from '@geoventra/contracts';
import { apiRequest, type QueryParams } from './api'; // Assumes a shared frontend API utility

/** Fetches the complete dashboard summary for the user's organization. */
export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return apiRequest<DashboardSummary>('/dashboard/summary');
}

// NOTE: This single endpoint relies on the backend (NestJS) to consolidate data from
// UsersService, FleetGroupsService, ApiKeysService, etc., into the DashboardSummary type.
