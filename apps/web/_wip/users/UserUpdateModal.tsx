/**
 * GEOVENTRA — modal for editing a user's profile and managing status/role.
 *
 * Handles the input form and API submission for user profile updates.
 */

'use client';

import { useState } from 'react';
import { Button, Input, Select, Card, CardHeader, CardTitle } from '@geoventra/ui';
import type { UserSummary, RoleName, UserStatus } from '@geoventra/contracts';
import { updateUser } from '@/lib/users-api';
import { LoadingPanel } from '@geoventra/ui';

interface UserUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void; // Callback to refresh the user list
  user: UserSummary;
}

// Placeholder for available roles/statuses (should ideally come from API/Context)
const availableRoles: RoleName[] = ['owner', 'admin', 'manager', 'viewer'];
const availableStatuses: UserStatus[] = ['active', 'invited', 'suspended'];

export function UserUpdateModal({ isOpen, onClose, onSuccess, user }: UserUpdateModalProps) {
  const [formData, setFormData] = useState<Partial<UserSummary>>({
    name: user.name,
    phone: user.phone,
    roleId: user.roleId,
    status: user.status,
    // ... other updatable fields like avatarUrl, etc.
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Filter out read-only/un-updatable fields before API call
      const updatePayload = {
        name: formData.name,
        phone: formData.phone,
        roleId: formData.roleId,
        status: formData.status,
      };
      await updateUser(user.id, updatePayload);
      onSuccess(); // Trigger list refresh
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred during user update.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-8">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Edit User: {user.name}</CardTitle>
        </CardHeader>
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input name="name" placeholder="Full Name" value={formData.name as string} onChange={handleChange} required />
            <Input name="email" type="email" placeholder="Email Address" value={user.email} onChange={handleChange} readOnly /> {/* Email should not be edited */}

            <div className="grid grid-cols-2 gap-4">
              <Select name="roleId" value={formData.roleId as string} onChange={handleChange} options={availableRoles.map(r => ({ value: r, label: r }))} aria-label="Role" />
              <Select name="status" value={formData.status as string} onChange={handleChange} options={availableStatuses.map(s => ({ value: s, label: s }))} aria-label="Status" />
            </div>

            {error && <EmptyState icon={<span aria-hidden="true">!</span>} title="Error" description={error} />}

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? <LoadingPanel label="Updating user…" /> : 'Save Changes'}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  );
}