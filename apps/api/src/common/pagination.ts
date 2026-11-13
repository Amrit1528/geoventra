/**
 * GEOVENTRA — pagination helpers.
 *
 * Engine list endpoints return a `Paginated<T>` envelope. Results are paged in memory;
 * the datasets returned here (fleet, DTCs, alerts, timeline) are small by construction.
 */

import type { Paginated } from '@geoventra/contracts';

export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

/** Slice a full list into a `Paginated` envelope. */
export function paginate<T>(items: T[], input: PaginationInput): Paginated<T> {
  const total = items.length;
  const requestedPageSize = Number.isFinite(input.pageSize) && input.pageSize! > 0 ? input.pageSize! : Math.max(total, 1);
  const pageSize = Math.min(Math.max(Math.floor(requestedPageSize), 1), 200);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(Math.floor(input.page ?? 1) || 1, 1), totalPages);

  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    meta: { page, pageSize, total, totalPages },
  };
}
