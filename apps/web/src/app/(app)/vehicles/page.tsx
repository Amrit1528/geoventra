/**
 * GEOVENTRA — Vehicles placeholder.
 *
 * This module is planned and tracked in docs/IMPLEMENTATION_GAP_REPORT.md.
 */

import type { ReactElement } from 'react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function VehiclesPage(): ReactElement {
  return (
    <PlaceholderPage
      title="Vehicles"
      description="Fleet registry, documents and assignments."
      phase="Phase 2 — Vehicle registry"
      features={[
        'Vehicle detail: odometer, documents, assignments, health',
        'Group management and bulk import/export',
        'Registration/insurance expiry tracking and document uploads',
      ]}
    />
  );
}
