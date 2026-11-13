/**
 * GEOVENTRA — shared component helpers.
 *
 * `cn` merges conditional class names, resolving tailwind conflicts in favour of the later
 * class. `Component` is a small element-tag polymorphic primitive for the design system.
 */

import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { HTMLAttributes, ReactElement } from 'react';

/** Merge class names with tailwind-conflict awareness. */
export function cn(...inputs: Parameters<typeof clsx>): string {
  return twMerge(clsx(...inputs));
}

export const COMPONENT_TAGS = ['section', 'div', 'article', 'aside'] as const;
export type ComponentTag = (typeof COMPONENT_TAGS)[number];

export interface ComponentProps extends HTMLAttributes<HTMLElement> {
  /** HTML tag to render. Defaults to `section`. */
  as?: ComponentTag;
}

/** A polymorphic wrapper element used by higher-level primitives. */
export function Component({ as: Tag = 'section', ...props }: ComponentProps): ReactElement {
  return <Tag {...props} />;
}
