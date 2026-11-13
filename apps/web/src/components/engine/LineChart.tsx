/**
 * GEOVENTRA — SVG line chart.
 *
 * Hand-rolled multi-series chart (no charting dependency). Renders a time-scaled x-axis,
 * gridlines, an optional dashed threshold line and a hover tooltip. Designed for the engine
 * health pages where a branded, dependency-free chart matters more than chart-library
 * features.
 */

'use client';

import { useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react';
import { cn } from '@geoventra/ui';

export interface ChartPoint {
  t: string;
  value: number;
}

export interface ChartSeries {
  name: string;
  color: string;
  points: ChartPoint[];
}

export interface LineChartProps {
  series: ChartSeries[];
  unit?: string;
  /** Optional threshold drawn as a dashed red line. */
  threshold?: number | null;
  height?: number;
  /** Accessible label for the chart. */
  ariaLabel?: string;
  className?: string;
}

const PADDING = { top: 12, right: 12, bottom: 22, left: 40 };
const GRID_LINES = 4;

function formatTick(value: number): string {
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

export function LineChart({
  series,
  unit,
  threshold,
  height = 200,
  ariaLabel = 'Line chart',
  className,
}: LineChartProps): ReactElement {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ seriesIndex: number; pointIndex: number } | null>(null);

  const model = useMemo(() => {
    const allPoints = series.flatMap((entry) => entry.points);
    if (allPoints.length === 0) return null;

    const times = allPoints.map((point) => new Date(point.t).getTime()).filter((time) => Number.isFinite(time));
    const minTime = times.length > 0 ? Math.min(...times) : 0;
    const maxTime = times.length > 0 ? Math.max(...times) : 1;
    const timeSpan = maxTime - minTime || 1;

    const values = allPoints.map((point) => point.value);
    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);
    if (threshold !== null && threshold !== undefined && Number.isFinite(threshold)) {
      minValue = Math.min(minValue, threshold);
      maxValue = Math.max(maxValue, threshold);
    }
    const valueSpan = maxValue - minValue || Math.abs(maxValue || 1) * 0.1 || 1;
    const pad = valueSpan * 0.1;
    const yMin = minValue - pad;
    const yMax = maxValue + pad;

    const width = 640; // internal coordinate space; the SVG scales to container width
    const plotWidth = width - PADDING.left - PADDING.right;
    const plotHeight = height - PADDING.top - PADDING.bottom;

    const xFor = (t: string | number): number => {
      const time = typeof t === 'number' ? t : new Date(t).getTime();
      return PADDING.left + ((time - minTime) / timeSpan) * plotWidth;
    };
    const yFor = (value: number): number => {
      const ratio = (value - yMin) / (yMax - yMin || 1);
      return PADDING.top + (1 - ratio) * plotHeight;
    };

    const paths = series.map((entry) => {
      const data = entry.points
        .filter((point) => Number.isFinite(point.value))
        .map((point) => ({ x: xFor(point.t), y: yFor(point.value), point }));
      if (data.length === 0) return null;
      const d = data.map((entry2, index) => `${index === 0 ? 'M' : 'L'}${entry2.x.toFixed(2)},${entry2.y.toFixed(2)}`).join(' ');
      return { d, points: data };
    });

    const ticks = Array.from({ length: GRID_LINES + 1 }, (_, index) => {
      const ratio = index / GRID_LINES;
      const value = yMax - ratio * (yMax - yMin);
      return { value, y: yFor(value) };
    });

    return { paths, ticks, width, height, yMax, yMin, threshold, unit };
  }, [series, threshold, height, unit]);

  if (!model) {
    return (
      <div
        className={cn('flex h-40 items-center justify-center text-xs text-[var(--text-muted)]', className)}
        role="img"
        aria-label={ariaLabel}
      >
        No data for the selected range
      </div>
    );
  }

  const handleMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
    const scaleX = model.width / rect.width;
    const x = (event.clientX - rect.left) * scaleX;

    let bestSeriesIndex = -1;
    let bestPointIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [seriesIndex, path] of model.paths.entries()) {
      if (!path) continue;
      for (const [pointIndex, candidate] of path.points.entries()) {
        const distance = Math.abs(candidate.x - x);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestSeriesIndex = seriesIndex;
          bestPointIndex = pointIndex;
        }
      }
    }

    setHover((previous) => {
      if (bestSeriesIndex < 0) return null;
      if (previous?.seriesIndex === bestSeriesIndex && previous.pointIndex === bestPointIndex) {
        return previous;
      }
      return { seriesIndex: bestSeriesIndex, pointIndex: bestPointIndex };
    });
  };

  const handleMouseLeave = () => setHover(null);

  const hovered = hover ? model.paths[hover.seriesIndex]?.points[hover.pointIndex] : null;
  const hoveredSeries = hover ? series[hover.seriesIndex] : null;

  return (
    <div ref={containerRef} className={cn('relative w-full select-none', className)}>
      <svg
        viewBox={`0 0 ${model.width} ${model.height}`}
        className="block w-full"
        role="img"
        aria-label={ariaLabel}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Gridlines + y-axis labels */}
        {model.ticks.map((tick, index) => (
          <g key={index}>
            <line
              x1={PADDING.left}
              x2={model.width - PADDING.right}
              y1={tick.y}
              y2={tick.y}
              stroke="var(--border)"
              strokeWidth={1}
              strokeDasharray={index === model.ticks.length - 1 ? '0' : '3 3'}
            />
            <text x={PADDING.left - 6} y={tick.y + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
              {formatTick(tick.value)}
            </text>
          </g>
        ))}

        {/* Threshold */}
        {model.threshold !== null && model.threshold !== undefined && Number.isFinite(model.threshold) ? (
          <line
            x1={PADDING.left}
            x2={model.width - PADDING.right}
            y1={(() => {
              const ratio = (model.threshold - model.yMin) / (model.yMax - model.yMin || 1);
              return PADDING.top + (1 - ratio) * (model.height - PADDING.top - PADDING.bottom);
            })()}
            y2={(() => {
              const ratio = (model.threshold - model.yMin) / (model.yMax - model.yMin || 1);
              return PADDING.top + (1 - ratio) * (model.height - PADDING.top - PADDING.bottom);
            })()}
            stroke="var(--red-500)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />
        ) : null}

        {/* Series */}
        {model.paths.map((path, index) =>
          path ? (
            <path
              key={index}
              d={path.d}
              fill="none"
              stroke={series[index]?.color ?? 'var(--primary-500)'}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null,
        )}

        {/* Hover marker */}
        {hovered ? (
          <circle cx={hovered.x} cy={hovered.y} r={4} fill={hoveredSeries?.color ?? 'var(--primary-500)'} stroke="var(--bg-card)" strokeWidth={1.5} />
        ) : null}
      </svg>

      {/* Legend */}
      {series.length > 1 ? (
        <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-[var(--text-secondary)]">
          {series.map((entry) => (
            <span key={entry.name} className="flex items-center gap-1.5">
              <span className="h-2 w-3 rounded-sm" style={{ background: entry.color }} />
              {entry.name}
            </span>
          ))}
        </div>
      ) : null}

      {/* Tooltip */}
      {hovered && hoveredSeries ? (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[var(--border-strong)] bg-[var(--neutral-900)] px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-md)]"
          style={{ left: `${Math.min(100, (hovered.x / model.width) * 100)}%`, top: 0, transform: 'translateX(-50%)' }}
        >
          <span className="font-semibold text-[var(--text-primary)]">
            {hoveredSeries.name}: {hovered.point.value.toFixed(1)}{unit ? ` ${unit}` : ''}
          </span>
          <div className="text-[var(--text-muted)]">
            {new Date(hovered.point.t).toLocaleString()}
          </div>
        </div>
      ) : null}
    </div>
  );
}
