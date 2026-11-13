/** GEOVENTRA — vehicles page.
 *  Fleet registry: list, search and manage vehicles and their assignments.
 */
'use client';

import { type ReactElement, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, Pencil, Trash2, Truck, Car, Gauge, Shield, Navigation } from 'lucide-react';
import {
  Badge, BadgeVariant, Card, CardContent, CardHeader, CardTitle,
  KpiCard, PageLayout, LoadingPanel, EmptyState, Select, Button,
} from '@geoventra/ui';
import { fetchVehicles, createVehicle, updateVehicle, deleteVehicle, fetchVehicle } from '@/lib/vehicles-api';
import type { Paginated, VehicleSummary, VehicleStatus, FuelType, MaintenanceStatus } from '@geoventra/contracts';

type StatusVariant = 'neutral' | 'info' | 'success' | 'warning' | 'critical';

const STATUS_BADGE: Record<VehicleStatus, { label: string; variant: StatusVariant }> = {
  moving: { label: 'Moving', variant: 'success' },
  idle: { label: 'Idle', variant: 'neutral' },
  stopped: { label: 'Stopped', variant: 'warning' },
  offline: { label: 'Offline', variant: 'critical' },
};

const FUEL_TYPE_LABEL: Record<FuelType, string> = {
  petrol: 'Petrol',
  diesel: 'Diesel',
  cng: 'CNG',
  electric: 'Electric',
  hybrid: 'Hybrid',
};

const MAINTENANCE_BADGE: Record<MaintenanceStatus, { label: string; variant: StatusVariant }> = {
  ok: { label: 'OK', variant: 'success' },
  due_soon: { label: 'Due soon', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'critical' },
  in_service: { label: 'In service', variant: 'neutral' },
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'moving', label: 'Moving' },
  { value: 'idle', label: 'Idle' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'offline', label: 'Offline' },
];

export default function VehiclesPage(): ReactElement {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatus>('all');
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['vehicles', search, statusFilter, page],
    queryFn: () => fetchVehicles({ q: search, status: statusFilter === 'all' ? undefined : statusFilter, page, pageSize: 25 }),
  });

  const vehicles = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pageSize = data?.meta.pageSize ?? 25;
  const pageCount = Math.ceil(total / pageSize || 1);

  const queryClient = useQueryClient();
  const { mutate: create, isPending: creating } = useMutation({
    mutationFn: (input: any) => createVehicle(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const { mutate: update, isPending: updating } = useMutation({
    mutationFn: ({ id, input }: { id: string; input: any }) => updateVehicle(id, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });

  const { mutate: del, isPending: deleting } = useMutation({
    mutationFn: (id: string) => deleteVehicle(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicles'] });
      setSelectedIds([]);
    },
  });

  const handleDelete = (id: string) => {
    if (confirm('Delete this vehicle from the fleet registry?')) del(id);
  };

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (confirm(`Delete ${selectedIds.length} selected vehicle(s)?`)) {
      selectedIds.forEach(id => del(id));
    }
    setSelectedIds([]);
  };

  return (
    <PageLayout
      title="Vehicles & Assets"
      description="Fleet registry for vehicles and assets with status, assignments, maintenance signals and quick access to tracking and TPMS."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Fleet Operations' }, { label: 'Vehicles & Assets' }]}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex-1 max-w-md">
          <div className="relative">
            <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="text"
              className="min-w-0 flex-1 border border-[var(--border)] rounded-md pl-9 pr-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-500)]"
              placeholder="Search vehicles…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | VehicleStatus)}>
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
          <Button
            variant="primary"
            onClick={() => setSearch('')}
            disabled={creating || updating || deleting}
          >
            <Plus size={14} aria-hidden="true" className="mr-1" /> New vehicle
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-muted)]">
          {total} vehicle{total !== 1 ? 's' : ''} in registry
        </p>
        {selectedIds.length > 0 && (
          <Button variant="danger" size="sm" onClick={handleBulkDelete} disabled={deleting}>
            <Trash2 size={13} aria-hidden="true" className="mr-1" /> Delete {selectedIds.length}
          </Button>
        )}
      </div>

      {isLoading ? (
        <LoadingPanel label="Loading vehicles…" />
      ) : vehicles.length === 0 ? (
        <EmptyState
          icon={<Truck size={32} aria-hidden="true" />}
          title="No vehicles found"
          description={search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first vehicle to the fleet registry.'}
          action={
            <Button variant="primary" onClick={() => setSearch('')}>
              <Plus size={14} aria-hidden="true" /> Add vehicle
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {vehicles.map((v) => (
              <Card key={v.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-[var(--primary-500)] flex items-center justify-center text-white">
                        <Car size={18} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-[var(--text-primary)] truncate">{v.registrationNumber}</p>
                        <p className="text-xs text-[var(--text-muted)] truncate">{v.name}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant={STATUS_BADGE[v.status].variant}>{STATUS_BADGE[v.status].label}</Badge>
                      <Badge variant="neutral">{FUEL_TYPE_LABEL[v.fuelType]}</Badge>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-[var(--text-muted)]">
                    <span className="flex items-center gap-1"><Gauge size={12} aria-hidden="true" /> {v.odometerKm.toLocaleString()} km</span>
                    <span className="flex items-center gap-1"><Car size={12} aria-hidden="true" /> {v.category} · {v.manufacturer} {v.model}</span>
                    <span className="flex items-center gap-1"><Shield size={12} aria-hidden="true" /> {v.year}</span>
                    <span className="flex items-center gap-1"><Navigation size={12} aria-hidden="true" /> Odometer: {v.odometerKm.toLocaleString()} km</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => window.open(`/vehicles/${v.id}`, '_blank')}>
                      <Pencil size={12} aria-hidden="true" className="mr-1" /> View details
                    </Button>
                    <Button variant="ghost" size="sm" color="danger" onClick={() => handleDelete(v.id)} disabled={deleting}>
                      <Trash2 size={12} aria-hidden="true" /> Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-[var(--text-muted)]">
              Showing {((page - 1) * 25) + 1} to {Math.min(page * 25, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <span className="text-sm text-[var(--text-primary)]">Page {page} of {pageCount}</span>
              <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={page === pageCount}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </PageLayout>
  );
}
