/**
 * GEOVENTRA — Button component tests.
 *
 * Verifies the busy state, the disabled state and that clicks are wired to the
 * supplied handler.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('exposes an accessible name from its label', () => {
    render(<Button>Acknowledge</Button>);
    expect(screen.getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
  });

  it('calls the click handler', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Resolve</Button>);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('disables the button and marks it busy while loading', () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Acknowledge
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('announces the loading label to screen readers', () => {
    render(
      <Button loading loadingLabel="Saving changes">
        Save
      </Button>,
    );
    expect(screen.getByText('Saving changes')).toBeInTheDocument();
  });

  it('does not fire clicks while disabled', () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Acknowledge
      </Button>,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
