import type { ReactElement } from 'react';
import { PlaceholderPage } from '@/components/PlaceholderPage';

export default function UsersPage(): ReactElement {
  return (
    <PlaceholderPage
      title="Customers & Users"
      description="Manage users, customer access and collaboration across the organisation with role-aware controls."
      phase="Phase 9 — Administration"
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Business' }, { label: 'Customers & Users' }]}
      features={[
        'User directory with search, filters, roles and status management',
        'Invitations, activation/suspension and secure access controls',
        'Customer and organisation access management where supported',
        'Audit-friendly account administration aligned with RBAC permissions',
      ]}
    />
  );
}
