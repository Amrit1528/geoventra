/**
 * GEOVENTRA — Drivers placeholder.
 *
 * This module is planned and tracked in docs/IMPLEMENTATION_GAP_REPORT.md.
 */

import type { ReactElement } from 'react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function DriversPage(): ReactElement {
  return (
    <PlaceholderPage
      title="Drivers"
      description="Driver profiles, safety scores and behaviour events."
      phase="Phase 3 — Driver management"
      features={[
        'Safety score with 30-day trend',
        'Harsh event history per driver',
        'License expiry reminders and work-hours summaries',
      ]}
    />
  );
}
