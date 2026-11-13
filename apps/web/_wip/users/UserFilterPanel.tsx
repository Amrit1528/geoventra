/**
 * GEOVENTRA — user filter and search panel.
 *
 * Provides input fields and dropdowns for filtering the user list.
 */

'use client';

import { Select, Input, Button, Card, CardHeader, CardTitle } from '@geoventra/ui';
import type { RoleName, UserStatus } from '@geoventra/contracts';
import { useCallback } from 'react';

interface UserFilterPanelProps {
  // Current filter state and setter
  filters: {
    search: string;
    role: RoleName | undefined;
    status: UserStatus | undefined;
    fleetId: string | undefined;
  };
  setFilters: (newFilters: { search: string; role: RoleName | undefined; status: UserStatus | undefined; fleetId: string | undefined }) => void;
}

export function UserFilterPanel({ filters, setFilters }: UserFilterPanelProps) {
  // Placeholder for role and status options, which would typically come from a context or API
  const availableRoles: RoleName[] = ['owner', 'admin', 'manager', 'viewer'];
  const availableStatuses: UserStatus[] = ['active', 'invited', 'suspended'];

  const handleFilterChange = useCallback((key: keyof typeof filters, value: any) => {
    setFilters({
      ...filters,
      [key]: value,
    });
  }, [filters, setFilters]);

  return (
    <Card className="p-4 mb-6">
      <CardHeader>
        <CardTitle className="text-sm">Filter Users</CardTitle>
      </CardHeader>
      <div className="grid grid-cols-2 gap-4">
        <Input
          placeholder="Search by name or email"
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          aria-label="User search"
        />
        <Select
          value={filters.role || ''}
          onChange={(e) => handleFilterChange('role', e.target.value as RoleName | undefined)}
          options={availableRoles.map(r => ({ value: r, label: r }))}
          aria-label="Filter by role"
        />
        <Select
          value={filters.status || ''}
          onChange={(e) => handleFilterChange('status', e.target.value as UserStatus | undefined)}
          options={availableStatuses.map(s => ({ value: s, label: s }))}
          aria-label="Filter by status"
        />
        {/* Fleet filter would require a dedicated component/dropdown */}
        <Select
          value={filters.fleetId || ''}
          onChange={() => {}} // Placeholder implementation
          options={[{ value: '', label: 'All fleets' }]}
          aria-label="Filter by fleet"
        />
      </div>
    </Card>
  );
}