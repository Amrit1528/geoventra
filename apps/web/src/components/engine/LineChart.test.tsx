/**
 * Component tests for the SVG line chart.
 */

import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LineChart } from './LineChart';

const SERIES = [
  {
    name: 'Coolant Temp',
    color: 'var(--primary-500)',
    points: [
      { t: '2026-11-13T10:00:00.000Z', value: 92 },
      { t: '2026-11-13T11:00:00.000Z', value: 98 },
      { t: '2026-11-13T12:00:00.000Z', value: 110 },
    ],
  },
];

describe('LineChart', () => {
  it('renders an SVG chart with an accessible label', () => {
    render(<LineChart series={SERIES} unit="°C" threshold={105} ariaLabel="Coolant temperature chart" />);

    expect(screen.getByRole('img', { name: 'Coolant temperature chart' })).toBeInTheDocument();
  });

  it('renders one path per series', () => {
    const { container } = render(
      <LineChart
        series={[
          SERIES[0]!,
          { name: 'RPM', color: 'var(--amber-500)', points: SERIES[0]!.points.map((point) => ({ ...point, value: point.value * 60 })) },
        ]}
        unit=""
      />,
    );

    expect(container.querySelectorAll('path')).toHaveLength(2);
  });

  it('renders a dashed threshold line when a threshold is supplied', () => {
    const { container } = render(<LineChart series={SERIES} unit="°C" threshold={105} />);
    const thresholdLine = container.querySelector('line[stroke-dasharray="6 4"]');
    expect(thresholdLine).toBeInTheDocument();
  });

  it('renders an empty state when there is no data', () => {
    render(<LineChart series={[]} unit="°C" />);
    expect(screen.getByText('No data for the selected range')).toBeInTheDocument();
  });
});
