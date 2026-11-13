/**
 * GEOVENTRA — Badge component tests.
 *
 * Covers the tone mapping and the accessibility contract of the badge.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge, badgeVariantForSeverity } from './Badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>Healthy</Badge>);
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('applies the requested tone to the element', () => {
    render(<Badge variant="critical">Critical</Badge>);
    const badge = screen.getByText('Critical');
    expect(badge).toHaveAttribute('data-variant', 'critical');
  });

  it('renders a decorative dot without leaking it to assistive technology', () => {
    const { container } = render(<Badge dot>Online</Badge>);
    const dot = container.querySelector('span[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();
  });

  it('maps severity strings onto badge tones', () => {
    expect(badgeVariantForSeverity('critical')).toBe('critical');
    expect(badgeVariantForSeverity('warning')).toBe('warning');
    expect(badgeVariantForSeverity('healthy')).toBe('info');
    expect(badgeVariantForSeverity(null)).toBe('neutral');
    expect(badgeVariantForSeverity('unheard-of')).toBe('neutral');
  });
});
