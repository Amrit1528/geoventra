/**
 * GEOVENTRA — Devices placeholder.
 *
 * This module is planned and tracked in docs/IMPLEMENTATION_GAP_REPORT.md.
 */

import type { ReactElement } from 'react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function DevicesPage(): ReactElement {
  return (
    <PlaceholderPage
      title="Devices"
      description="GPS trackers, OBD dongles and asset tags."
      phase="Phase 7.1 — Device integration"
      features={[
        'Device registry with firmware and provider metadata',
        'Assignment history and capability mapping',
        'Connection status and ingestion audit trail',
      ]}
    />
  );
}
