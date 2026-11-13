/**
 * GEOVENTRA — badge component.
 *
 * Variants map onto the severities used across the platform. `badgeVariantForSeverity`
 * centralises the severity → tone mapping so every screen renders alerts the same way.
 */

import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from './Component';

export type BadgeVariant = 'neutral' | 'info' | 'success' | 'warning' | 'critical';
/** @deprecated Use BadgeVariant — kept for backwards-compatible call sites. */
export type BadgeTone = BadgeVariant;

const VARIANT_STYLES: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100/90 text-slate-700 border-slate-200 [html[data-theme="dark"]_&]:bg-slate-800/70 [html[data-theme="dark"]_&]:text-slate-200 [html[data-theme="dark"]_&]:border-slate-700',
  info: 'bg-blue-50 text-blue-700 border-blue-200 [html[data-theme="dark"]_&]:bg-blue-950/40 [html[data-theme="dark"]_&]:text-blue-300 [html[data-theme="dark"]_&]:border-blue-800/60',
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200 [html[data-theme="dark"]_&]:bg-emerald-950/40 [html[data-theme="dark"]_&]:text-emerald-300 [html[data-theme="dark"]_&]:border-emerald-800/60',
  warning: 'bg-amber-50 text-amber-800 border-amber-200 [html[data-theme="dark"]_&]:bg-amber-950/40 [html[data-theme="dark"]_&]:text-amber-300 [html[data-theme="dark"]_&]:border-amber-800/60',
  critical: 'bg-red-50 text-red-700 border-red-200 [html[data-theme="dark"]_&]:bg-red-950/40 [html[data-theme="dark"]_&]:text-red-300 [html[data-theme="dark"]_&]:border-red-800/60',
};

const DOT_STYLES: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-400',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
};

export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** Visual severity. Defaults to neutral. */
  variant?: BadgeVariant;
  /** @deprecated Use `variant`. */
  tone?: BadgeVariant;
  /** Render a decorative leading dot. */
  dot?: boolean;
  /** Size of the badge. Defaults to md. */
  size?: BadgeSize;
}

const SIZE_STYLES: Record<BadgeSize, string> = {
  sm: 'text-[9px] px-2 py-0.5',
  md: 'text-[11px] px-2.5 py-0.5',
};

export function Badge({
  variant,
  tone,
  dot = false,
  size = 'md',
  className,
  children,
  ...props
}: BadgeProps): ReactElement {
  const resolved = variant ?? tone ?? 'neutral';
  return (
    <span
      data-variant={resolved}
      data-size={size}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-semibold uppercase tracking-wide',
        SIZE_STYLES[size],
        VARIANT_STYLES[resolved],
        className,
      )}
      {...props}
    >
      {dot ? (
        <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', DOT_STYLES[resolved])} />
      ) : null}
      {children}
    </span>
  );
}

/** Map a severity/health value onto a badge variant. */
export function badgeVariantForSeverity(severity: string | null | undefined): BadgeVariant {
  switch ((severity ?? '').toLowerCase()) {
    case 'critical':
    case 'high':
      return 'critical';
    case 'warning':
    case 'medium':
      return 'warning';
    case 'low':
    case 'info':
      return 'info';
    case 'success':
      return 'success';
    case 'healthy':
    case 'ok':
      return 'info';
    default:
      return 'neutral';
  }
}

/** @deprecated Use `badgeVariantForSeverity`. */
export const severityTone = badgeVariantForSeverity;
