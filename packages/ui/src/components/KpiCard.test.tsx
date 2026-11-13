/**
 * GEOVENTRA — KpiCard component tests.
 *
 * Covers the headline value, the unit suffix and the delta indicator.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('renders the label, value and unit', () => {
    render(<KpiCard label="Healthy vehicles" value={18} unit="of 24" />);

    expect(screen.getByText('Healthy vehicles')).toBeInTheDocument();
    expect(screen.getByText('18')).toBeInTheDocument();
    expect(screen.getByText('of 24')).toBeInTheDocument();
  });

  it('renders a signed delta with its label', () => {
    render(<KpiCard label="Open alerts" value={7} delta={{ value: -2, label: 'vs. yesterday' }} />);

    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText('vs. yesterday')).toBeInTheDocument();
  });

  it('renders a placeholder instead of the value while loading', () => {
    render(<KpiCard label="Open alerts" value={7} loading />);
    expect(screen.queryByText('7')).not.toBeInTheDocument();
  });
});
