/**
 * GEOVENTRA - automated tests for the alert center (geofence alerts + lifecycle).
 */

import { describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { AlertSummary } from '@geoventra/contracts';
import { AlertCenter } from './AlertCenter';

const createAlert = (overrides: Partial<AlertSummary> = {}): AlertSummary => ({
  id: 'alert-1',
  type: 'geofence_entry',
  severity: 'high',
  status: 'open',
  title: 'Truck entered restricted zone',
  message: 'MH 12 AB 1234 entered geofence "Warehouse 07".',
  vehicleId: 'v1',
  vehicleRegistration: 'MH 12 AB 1234',
  driverId: null,
  driverName: null,
  latitude: 19.076,
  longitude: 72.8777,
  occurredAt: new Date(Date.now() - 60_000).toISOString(),
  acknowledgedAt: null,
  acknowledgedBy: null,
  resolvedAt: null,
  resolvedBy: null,
  metadata: {},
  ...overrides,
});

describe('AlertCenter', () => {
  const onAcknowledge = vi.fn();
  const onResolve = vi.fn();
  const onRefresh = vi.fn();

  it('renders the loading state while alerts are being fetched', () => {
    render(
      <AlertCenter
        alerts={[]}
        isLoading
        error={null}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText(/loading alerts/i)).toBeInTheDocument();
  });

  it('renders the empty state when no alerts exist', () => {
    render(
      <AlertCenter
        alerts={[]}
        isLoading={false}
        error={null}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText('No alerts')).toBeInTheDocument();
  });

  it('renders the error state when the inbox fails', () => {
    render(
      <AlertCenter
        alerts={[]}
        isLoading={false}
        error={new Error('socket down')}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByText('Alerts unavailable')).toBeInTheDocument();
    expect(screen.getByText('socket down')).toBeInTheDocument();
  });

  it('renders the raised alert with severity, status and type', () => {
    render(
      <AlertCenter
        alerts={[createAlert()]}
        isLoading={false}
        error={null}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.getByTestId('alert-item-alert-1')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('geofence_entry')).toBeInTheDocument();
    expect(screen.getByText('Truck entered restricted zone')).toBeInTheDocument();
    expect(screen.getByText('MH 12 AB 1234')).toBeInTheDocument();
  });

  it('invokes acknowledge when the operator acknowledges an open alert', () => {
    render(
      <AlertCenter
        alerts={[createAlert()]}
        isLoading={false}
        error={null}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId('alert-acknowledge-alert-1'));

    expect(onAcknowledge).toHaveBeenCalledTimes(1);
    expect(onAcknowledge).toHaveBeenCalledWith(expect.objectContaining({ id: 'alert-1' }));
  });

  it('invokes resolve when an acknowledged alert is resolved', () => {
    render(
      <AlertCenter
        alerts={[createAlert({ status: 'acknowledged' })]}
        isLoading={false}
        error={null}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByTestId('alert-resolve-alert-1'));

    expect(onResolve).toHaveBeenCalledTimes(1);
    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({ id: 'alert-1' }));
  });

  it('shows no lifecycle action for resolved alerts', () => {
    render(
      <AlertCenter
        alerts={[createAlert({ status: 'resolved' })]}
        isLoading={false}
        error={null}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    expect(screen.queryByTestId('alert-acknowledge-alert-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('alert-resolve-alert-1')).not.toBeInTheDocument();
  });

  it('exposes a refresh action when a refresh handler is provided', () => {
    render(
      <AlertCenter
        alerts={[createAlert()]}
        isLoading={false}
        error={null}
        onAcknowledge={onAcknowledge}
        onResolve={onResolve}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
