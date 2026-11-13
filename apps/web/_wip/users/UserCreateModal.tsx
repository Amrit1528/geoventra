/**
 * GEOVENTRA — modal for creating a new user.
 *
 * Handles the input form and API submission for user creation/invitation.
 */

'use client';

import { useState } from 'react';
import { Button, Input, Select, Card, CardHeader, CardTitle, EmptyState } from '@geoventra/ui';
import type { RoleName, UserStatus } from '@geoventra/contracts';
import { createUser } from '@/lib/users-api';
import { LoadingPanel } from '@geoventra/ui';

interface UserCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void; // Callback to refresh the user list
}

// Placeholder for available roles/statuses (should ideally come from API/Context)
const availableRoles: RoleName[] = ['owner', 'admin', 'manager', 'viewer'];
const availableStatuses: UserStatus[] = ['active', 'invited', 'suspended'];

export function UserCreateModal({ isOpen, onClose, onSuccess }: UserCreateModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    roleId: availableRoles[0], // Default to admin/owner
    organisationId: 'ORG_ID_PLACEHOLDER', // Must be fetched from current user context
    fleetId: '',
    isInvitation: true,
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Assume all required fields are present and valid
      const newUserData = {
        name: formData.name,
        email: formData.email,
        password: formData.password,
        roleId: formData.roleId,
        organisationId: formData.organisationId,
        fleetId: formData.fleetId || undefined,
        isInvitation: formData.isInvitation,
      };
      await createUser(newUserData);
      onSuccess(); // Trigger list refresh
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during user creation.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Create New User</CardTitle>
        </CardHeader>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input name="name" placeholder="Full Name" value={formData.name} onChange={handleChange} required />
            <Input name="email" type="email" placeholder="Email Address" value={formData.email} onChange={handleChange} required />
            <Input name="password" type="password" placeholder="Password" value={formData.password} onChange={handleChange} required />

            <div className="grid grid-cols-2 gap-4">
              <Select name="roleId" value={formData.roleId} onChange={handleChange} options={availableRoles.map(r => ({ value: r, label: r }))} aria-label="Role" />
              <Select name="status" value={formData.status || ''} onChange={handleChange} options={availableStatuses.map(s => ({ value: s, label: s }))} aria-label="Status" />
            </div>

            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                name="isInvitation"
                checked={formData.isInvitation}
                onChange={handleChange}
                className="accent-[var(--primary-500)]"
              />
              Send Invitation Email
            </label>

            {error && <EmptyState icon={<span aria-hidden="true">!</span>} title="Error" description={error} />}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <LoadingPanel label="Creating user…" /> : 'Create User'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}