/**
 * GEOVENTRA — EmptyState component tests.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';
import { Button } from './Button';

describe('EmptyState', () => {
  it('renders the title and description', () => {
    render(<EmptyState title="No diagnostics" description="This vehicle has no recorded DTCs." />);

    expect(screen.getByText('No diagnostics')).toBeInTheDocument();
    expect(screen.getByText('This vehicle has no recorded DTCs.')).toBeInTheDocument();
  });

  it('renders an optional action', () => {
    render(<EmptyState title="No diagnostics" action={<Button>Refresh</Button>} />);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('hides the decorative icon from assistive technology', () => {
    const { container } = render(
      <EmptyState
        icon={<span data-testid="icon">icon</span>}
        title="No diagnostics"
      />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });
});
