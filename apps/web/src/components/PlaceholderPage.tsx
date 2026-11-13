/**
 * GEOVENTRA — placeholder module page.
 *
 * Used for modules that exist in the navigation but are not yet implemented. Each page states
 * plainly what the module is and links to the implementation plan so the missing work is
 * discoverable rather than hidden.
 */

import type { ReactElement, ReactNode } from 'react';
import { Construction } from 'lucide-react';
import { PageLayout, EmptyState } from '@geoventra/ui';

export interface PlaceholderPageProps {
  title: string;
  description: string;
  /** Phase label shown in the empty state, e.g. "Phase 5.3 — TPMS". */
  phase: string;
  /** Short summary of what the module will do. */
  features: string[];
}

export function PlaceholderPage({ title, description, phase, features }: PlaceholderPageProps): ReactElement {
  return (
    <PageLayout title={title} description={description}>
      <EmptyState
        icon={<Construction size={28} aria-hidden="true" />}
        title={`${phase} — planned`}
        description={`${title} is scaffolded in the data model and tracked in docs/IMPLEMENTATION_GAP_REPORT.md. The following is planned:`}
        action={
          <ul className="mx-auto mt-2 flex max-w-md list-disc flex-col gap-1 text-left text-xs text-[var(--text-secondary)]">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        }
      />
    </PageLayout>
  );
}
