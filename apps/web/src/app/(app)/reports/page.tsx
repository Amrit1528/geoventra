/**
 * GEOVENTRA — Reports placeholder.
 *
 * This module is planned and tracked in docs/IMPLEMENTATION_GAP_REPORT.md.
 */

import type { ReactElement } from 'react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function ReportsPage(): ReactElement {
  return (
    <PlaceholderPage
      title="Reports"
      description="Distance, utilisation, idle and safety reports."
      phase="Phase 8 — Reporting"
      features={[
        'Scheduled and on-demand reports with CSV export',
        'Distance, utilisation, idle, driver-performance reports',
        'Fleet-activity and vehicle-status summaries',
      ]}
    />
  );
}
