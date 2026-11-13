/**
 * GEOVENTRA — card components.
 *
 * A single Card plus structured subcomponents: CardHeader, CardTitle (with an `as` heading
 * level), CardDescription, CardContent and CardFooter.
 */

import type { HTMLAttributes, ReactElement } from 'react';
import { cn } from './Component';

type HeadingLevel = 'h2' | 'h3' | 'h4' | 'h5' | 'h6';

export type CardProps = HTMLAttributes<HTMLDivElement>;
export type CardSectionProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps): ReactElement {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-sm)]',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: CardSectionProps): ReactElement {
  return (
    <div
      className={cn('flex flex-col gap-0.5 border-b border-[var(--border)] px-5 py-4', className)}
      {...props}
    />
  );
}

export interface CardTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  /** Heading level to render. Defaults to h2. */
  as?: HeadingLevel;
}

export function CardTitle({ as: Component = 'h2', className, ...props }: CardTitleProps): ReactElement {
  return (
    <Component
      className={cn('text-sm font-semibold uppercase tracking-wide text-[var(--text-secondary)]', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>): ReactElement {
  return (
    <p className={cn('text-xs text-[var(--text-muted)]', className)} {...props} />
  );
}

export function CardContent({ className, ...props }: CardSectionProps): ReactElement {
  return <div className={cn('px-5 py-4', className)} {...props} />;
}

export function CardFooter({ className, ...props }: CardSectionProps): ReactElement {
  return (
    <div
      className={cn('flex items-center justify-between gap-3 border-t border-[var(--border)] px-5 py-3', className)}
      {...props}
    />
  );
}
