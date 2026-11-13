/**
 * GEOVENTRA — health score breakdown.
 *
 * Renders the deterministic score components (DTCs, alerts, metrics, MIL) that explain why a
 * vehicle carries its health score.
 */

import { type ReactElement } from 'react';
import { cn } from '@geoventra/ui';

export interface HealthBreakdownPart {
  key: string;
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HealthBreakdownProps {
  parts: HealthBreakdownPart[];
}

export function HealthBreakdown({ parts }: HealthBreakdownProps): ReactElement {
  return (
    <ul className="flex flex-col gap-2">
      {parts.map((part) => {
        const ratio = part.weight > 0 ? part.score / part.weight : 0;
        const tone = ratio >= 0.8 ? 'bg-emerald-500' : ratio >= 0.5 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <li key={part.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-[11px] font-semibold text-[var(--text-secondary)]">{part.label}</span>
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                {part.score}/{part.weight}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--neutral-800)]">
              <div
                className={cn('h-full rounded-full transition-all', tone)}
                style={{ width: `${Math.round(ratio * 100)}%` }}
                role="progressbar"
                aria-valuenow={part.score}
                aria-valuemin={0}
                aria-valuemax={part.weight}
                aria-label={part.label}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">{part.detail}</p>
          </li>
        );
      })}
    </ul>
  );
}
