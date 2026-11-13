/**
 * GEOVENTRA — radial health score.
 *
 * A compact SVG ring that visualises the 0–100 engine health score.
 */

'use client';

import { type ReactElement } from 'react';
import { cn } from '@geoventra/ui';

export interface HealthRingProps {
  score: number;
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  size?: number;
}

const STATUS_COLOR: Record<HealthRingProps['status'], string> = {
  healthy: 'var(--green-500)',
  degraded: 'var(--amber-500)',
  critical: 'var(--red-500)',
  unknown: 'var(--neutral-500)',
};

export function HealthRing({ score, status, size = 132 }: HealthRingProps): ReactElement {
  const safeScore = Math.max(0, Math.min(100, score));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safeScore / 100);
  const stroke = STATUS_COLOR[status];

  return (
    <div
      className={cn('relative flex items-center justify-center')}
      role="img"
      aria-label={`Engine health score ${safeScore} out of 100, status ${status}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 120 120" className="-rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="var(--neutral-800)" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 400ms ease' }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-black tracking-tight text-[var(--text-primary)]">{Math.round(safeScore)}</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Health</span>
      </div>
    </div>
  );
}
