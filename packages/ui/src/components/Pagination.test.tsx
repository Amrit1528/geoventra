/**
 * GEOVENTRA — Pagination component tests.
 *
 * Covers the summary line, the page window and the page-size selector.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Pagination, pageWindow } from './Pagination';

describe('pageWindow', () => {
  it('keeps the window centred on the current page', () => {
    expect(pageWindow(5, 10, 5)).toEqual([3, 4, 5, 6, 7]);
  });

  it('clamps the window at the end of the range', () => {
    expect(pageWindow(10, 10, 5)).toEqual([6, 7, 8, 9, 10]);
  });

  it('returns nothing when there are no pages', () => {
    expect(pageWindow(1, 0, 5)).toEqual([]);
  });
});

describe('Pagination', () => {
  it('summarises the visible rows', () => {
    render(
      <Pagination page={2} pageSize={25} total={120} totalPages={5} onPageChange={() => {}} itemLabel="vehicles" />,
    );
    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(screen.getByText(/120/)).toBeInTheDocument();
    expect(screen.getByText(/vehicles/)).toBeInTheDocument();
  });

  it('marks the current page with aria-current', () => {
    render(<Pagination page={3} pageSize={10} total={100} totalPages={10} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
  });

  it('requests the next and previous page', () => {
    const onPageChange = vi.fn();
    render(<Pagination page={3} pageSize={10} total={100} totalPages={10} onPageChange={onPageChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(onPageChange).toHaveBeenCalledWith(4);

    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it('disables the previous button on the first page', () => {
    render(<Pagination page={1} pageSize={10} total={100} totalPages={10} onPageChange={() => {}} />);
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('reports a new page size', () => {
    const onPageSizeChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageSize={10}
        total={100}
        totalPages={10}
        onPageChange={() => {}}
        onPageSizeChange={onPageSizeChange}
      />,
    );

    fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } });
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
