/**
 * GEOVENTRA — Alerts placeholder.
 *
 * This module is planned and tracked in docs/IMPLEMENTATION_GAP_REPORT.md.
 */

import type { ReactElement } from 'react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function AlertsPage(): ReactElement {
  return (
    <PlaceholderPage
      title="Alerts"
      description="Alert inbox, acknowledgement and resolution."
      phase="Phase 5 — Alerting"
      features={[
        'Unified alert inbox with severity/type filters',
        'Acknowledge and resolve workflows with audit trail',
        'Notification channel preferences per alert type',
      ]}
    />
  );
}
