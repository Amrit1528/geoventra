/**
 * GEOVENTRA — Card component tests.
 *
 * Ensures the card anatomy renders the expected heading levels and regions.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './Card';

describe('Card', () => {
  it('renders header, content and footer regions', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Engine health</CardTitle>
        </CardHeader>
        <CardContent>Score 92</CardContent>
        <CardFooter>Updated 2m ago</CardFooter>
      </Card>,
    );

    expect(screen.getByRole('heading', { name: 'Engine health' })).toBeInTheDocument();
    expect(screen.getByText('Score 92')).toBeInTheDocument();
    expect(screen.getByText('Updated 2m ago')).toBeInTheDocument();
  });

  it('renders the title at the requested heading level', () => {
    render(
      <Card>
        <CardTitle as="h3">Diagnostics</CardTitle>
      </Card>,
    );
    expect(screen.getByRole('heading', { level: 3, name: 'Diagnostics' })).toBeInTheDocument();
  });

  it('renders an optional description', () => {
    render(<CardDescription>Rolling 24 hour window</CardDescription>);
    expect(screen.getByText('Rolling 24 hour window')).toBeInTheDocument();
  });
});
