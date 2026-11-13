/**
 * GEOVENTRA — pagination component.
 *
 * Renders a summary line, a windowed page selector and an optional page-size dropdown.
 */

import { type ChangeEvent, type ReactElement } from 'react';
import { cn } from './Component';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** Noun used in the summary line, e.g. "vehicles" → "Showing 25 of 124 vehicles". */
  itemLabel?: string;
  onPageChange: (page: number) => void;
  /** When set, renders a "Rows per page" selector calling this handler. */
  onPageSizeChange?: (pageSize: number) => void;
  className?: string;
}

/** The sliding window of page numbers to render. */
export function pageWindow(current: number, totalPages: number, windowSize = 5): number[] {
  if (totalPages <= 0) return [];
  const size = Math.max(1, Math.floor(windowSize));
  let start = Math.max(1, current - Math.floor(size / 2));
  const end = Math.min(totalPages, start + size - 1);
  start = Math.max(1, end - size + 1);
  const pages: number[] = [];
  for (let page = start; page <= end; page += 1) pages.push(page);
  return pages;
}

export function Pagination({
  page,
  pageSize,
  total,
  totalPages,
  itemLabel,
  onPageChange,
  onPageSizeChange,
  className,
}: PaginationProps): ReactElement {
  const canPrevious = page > 1;
  const canNext = page < totalPages;
  const pages = pageWindow(page, totalPages);
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav
      className={cn('flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--text-secondary)]', className)}
      aria-label="Pagination"
    >
      <p>
        Showing <span className="font-semibold text-[var(--text-primary)]">{from}–{to}</span> of{' '}
        <span className="font-semibold text-[var(--text-primary)]">{total}</span>
        {itemLabel ? ` ${itemLabel}` : ' records'} · Page{' '}
        <span className="font-semibold text-[var(--text-primary)]">{page}</span> of {totalPages}
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange ? (
          <label className="flex items-center gap-2" htmlFor="rows-per-page">
            <span className="text-[var(--text-muted)]">Rows per page</span>
            <select
              id="rows-per-page"
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => onPageSizeChange(Number(event.target.value))}
              className="h-8 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2 text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
            >
              {[10, 25, 50].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={!canPrevious}
          aria-label="Previous page"
          className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 font-semibold transition-colors hover:bg-[var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        {pages.map((candidate) => (
          <button
            key={candidate}
            type="button"
            onClick={() => onPageChange(candidate)}
            aria-label={`Page ${candidate}`}
            aria-current={candidate === page ? 'page' : undefined}
            className={cn(
              'h-8 w-8 rounded-lg border text-xs font-semibold transition-colors',
              candidate === page
                ? 'border-[var(--primary-600)] bg-[var(--primary-600)] text-white'
                : 'border-[var(--border-strong)] hover:bg-[var(--bg-surface-hover)]',
            )}
          >
            {candidate}
          </button>
        ))}

        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={!canNext}
          aria-label="Next page"
          className="rounded-lg border border-[var(--border-strong)] px-3 py-1.5 font-semibold transition-colors hover:bg-[var(--bg-surface-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </div>
    </nav>
  );
}
