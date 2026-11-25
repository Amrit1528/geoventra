/**
 * GEOVENTRA — shared modal shell for entity create/edit forms.
 *
 * Keeps the header and actions in view while the form itself scrolls, so long
 * forms stay usable on short screens. Closes on Escape or backdrop click.
 */

'use client';

import { type ReactElement, type ReactNode, useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { cn } from '@geoventra/ui';

export interface EntityFormModalProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg' | 'xl';
  testId?: string;
}

const SIZES: Record<NonNullable<EntityFormModalProps['size']>, string> = {
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
};

export function EntityFormModal({ open, title, description, onClose, children, footer, size = 'lg', testId }: EntityFormModalProps): ReactElement | null {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-overlay)] flex items-center justify-center bg-black/60 p-3 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-testid={testId}
      onClick={onClose}
    >
      <div
        className={cn('flex max-h-[90vh] w-full flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--bg-card)] shadow-[var(--shadow-xl)]', SIZES[size])}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-[var(--text-primary)]">{title}</h2>
            {description ? <p className="mt-0.5 text-xs text-[var(--text-muted)]">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="shrink-0 rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)]"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer ? <footer className="shrink-0 border-t border-[var(--border)] px-5 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
