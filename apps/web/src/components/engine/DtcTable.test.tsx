/**
 * Component tests for the DTC table.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { EngineDtc } from '@geoventra/contracts';
import { DtcTable } from './DtcTable';

function makeDtc(overrides: Partial<EngineDtc> = {}): EngineDtc {
  return {
    id: 'dtc-1',
    vehicleId: 'vehicle-1',
    code: 'P0300',
    category: 'P',
    description: 'Random/multiple cylinder misfire detected',
    severity: 'critical',
    status: 'active',
    milOn: true,
    firstDetectedAt: '2026-11-12T00:00:00.000Z',
    lastDetectedAt: '2026-11-12T01:00:00.000Z',
    occurrenceCount: 3,
    freezeFrame: null,
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T01:00:00.000Z',
    ...overrides,
  };
}

describe('DtcTable', () => {
  it('renders DTC rows with severity and status', () => {
    render(
      <DtcTable rows={[makeDtc()]} onAcknowledge={() => {}} onResolve={() => {}} />,
    );

    expect(screen.getByText('P0300')).toBeInTheDocument();
    expect(screen.getByText(/Random\/multiple cylinder misfire/)).toBeInTheDocument();
    expect(screen.getByText('critical')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('fires acknowledge and resolve callbacks', () => {
    const onAcknowledge = vi.fn();
    const onResolve = vi.fn();
    render(
      <DtcTable rows={[makeDtc()]} onAcknowledge={onAcknowledge} onResolve={onResolve} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Acknowledge' }));
    expect(onAcknowledge).toHaveBeenCalledWith(expect.objectContaining({ code: 'P0300' }));

    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ code: 'P0300' }));
  });

  it('does not offer acknowledge for an already acknowledged DTC', () => {
    render(
      <DtcTable
        rows={[makeDtc({ status: 'acknowledged', acknowledged: true })]}
        onAcknowledge={() => {}}
        onResolve={() => {}}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
  });

  it('renders an empty state for no trouble codes', () => {
    render(<DtcTable rows={[]} onAcknowledge={() => {}} onResolve={() => {}} />);
    expect(screen.getByText(/No trouble codes/)).toBeInTheDocument();
  });
});
