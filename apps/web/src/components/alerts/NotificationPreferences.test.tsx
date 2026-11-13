/**
 * GEOVENTRA - automated tests for the notification preferences panel.
 */

import { describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { NotificationPreference } from '@geoventra/contracts';
import { NotificationPreferences } from './NotificationPreferences';

const createPreference = (overrides: Partial<NotificationPreference> = {}): NotificationPreference => ({
  id: 'pref-1',
  alertType: 'geofence_entry',
  channel: 'in_app',
  enabled: true,
  minSeverity: 'medium',
  ...overrides,
});

describe('NotificationPreferences', () => {
  const onChange = vi.fn();

  it('renders the loading state', () => {
    render(
      <NotificationPreferences preferences={[]} isLoading error={null} onChange={onChange} />,
    );

    expect(screen.getByText(/loading notification preferences/i)).toBeInTheDocument();
  });

  it('renders the error state', () => {
    render(
      <NotificationPreferences preferences={[]} isLoading={false} error={new Error('boom')} onChange={onChange} />,
    );

    expect(screen.getByText('Preferences unavailable')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
  });

  it('renders stored preferences and allows saving', () => {
    render(
      <NotificationPreferences preferences={[createPreference()]} isLoading={false} error={null} onChange={onChange} />,
    );

    expect(screen.getByText('Notification preferences')).toBeInTheDocument();
    expect(screen.getByText('geofence_entry')).toBeInTheDocument();
    expect(screen.getByText('in_app')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'pref-1', enabled: true, minSeverity: 'medium' }),
    ]);
  });

  it('toggles the in-app delivery flag and saves the updated list', () => {
    render(
      <NotificationPreferences preferences={[createPreference({ enabled: true })]} isLoading={false} error={null} onChange={onChange} />,
    );

    const toggle = screen.getByTestId('notification-enabled-geofence_entry-in_app');
    expect(toggle).toBeChecked();

    fireEvent.click(toggle);
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'pref-1', enabled: false }),
    ]);
  });

  it('changes the minimum severity through the select', () => {
    render(
      <NotificationPreferences preferences={[createPreference({ minSeverity: 'medium' })]} isLoading={false} error={null} onChange={onChange} />,
    );

    fireEvent.change(screen.getByTestId('notification-min-severity-geofence_entry-in_app'), {
      target: { value: 'critical' },
    });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(onChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'pref-1', minSeverity: 'critical' }),
    ]);
  });
});
