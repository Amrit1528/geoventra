/**
 * GEOVENTRA — user summary table.
 *
 * Displays a paginated list of user summaries.
 */

'use client';

import { Table, TableHeader, TableRow, TableBody, TableCell, Button, Badge, Input } from '@geoventra/ui';
import type { UserSummary } from '@geoventra/contracts';
import type { RoleName, UserStatus } from '@geoventra/contracts';
import { cn } from '@/lib/utils'; // Assumes a utility for class merging

interface UserTableProps {
  users: UserSummary[];
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  onAction: (userId: string, action: 'edit' | 'invite') => void;
}

const getStatusBadge = (status: UserStatus) => {
  let variant: 'success' | 'neutral' | 'warning' | 'danger';
  switch (status) {
    case 'active':
      variant = 'success';
      break;
    case 'invited':
      variant = 'neutral';
      break;
    case 'suspended':
      variant = 'warning';
      break;
    default:
      variant = 'danger';
  }
  return <Badge variant={variant}> {status.charAt(0).toUpperCase() + status.slice(1)} </Badge>;
};

export function UserTable({ users, isLoading, total, page, pageSize, onAction }: UserTableProps) {
  if (isLoading) {
    return <div className="p-8 text-center text-sm text-[var(--text-muted)]">Loading user data...</div>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableCell className="w-[50px]"></TableCell>
          <TableCell>Name</TableCell>
          <TableCell>Email</TableCell>
          <TableCell>Role</TableCell>
          <TableCell>Status</TableCell>
          <TableCell className="text-right">Last Login</TableCell>
          <TableCell className="text-right">Actions</TableCell>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.length > 0 ? (
          users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-mono text-xs">{user.id.substring(0, 6)}</TableCell>
              <TableCell className="font-semibold">{user.name}</TableCell>
              <TableCell className="text-sm">{user.email}</TableCell>
              <TableCell>{user.roleName}</TableCell>
              <TableCell>{getStatusBadge(user.status)}</TableCell>
              <TableCell className="text-xs text-[var(--text-muted)]">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}</TableCell>
              <TableCell className="text-right flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => onAction(user.id, 'edit')}>Edit</Button>
                <Button size="sm" variant="primary" onClick={() => onAction(user.id, 'invite')}>Invite</Button>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={7} className="text-center py-8 text-[var(--text-muted)]">
              No users match the current filters.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}