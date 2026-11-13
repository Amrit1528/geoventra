/**
 * GEOVENTRA — Administration placeholder.
 *
 * This module is planned and tracked in docs/IMPLEMENTATION_GAP_REPORT.md.
 */

import type { ReactElement } from 'react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function AdminPage(): ReactElement {
  return (
    <PlaceholderPage
      title="Administration"
      description="Users, roles, settings, API keys and audit."
      phase="Phase 9 — Administration"
      features={[
        'User and role management with permission editing',
        'Organisation settings, API keys and audit logs',
        'Fleet groups and notification preferences',
      ]}
    />
  );
}
