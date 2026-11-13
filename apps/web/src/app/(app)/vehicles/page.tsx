'use client';

import { type ReactElement, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Car, Gauge, MapPin, Plus, Search, Trash2 } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, LoadingPanel, PageLayout, Select } from '@geoventra/ui';
import { createVehicle, deleteVehicle, fetchVehicles } from '@/lib/vehicles-api';
import type { VehicleStatus } from '@geoventra/contracts';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'moving', label: 'Moving' },
  { value: 'idle', label: 'Idle' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'offline', label: 'Offline' },
];

export default function VehiclesPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatus>('all');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ registrationNumber: '', name: '', category: 'car', manufacturer: '', model: '', fuelType: 'diesel', year: new Date().getFullYear(), vin: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['vehicles', search, statusFilter, page],
    queryFn: () => fetchVehicles({ q: search || undefined, status: statusFilter === 'all' ? undefined : statusFilter, page, pageSize: 25 }),
  });
  const vehicles = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const pageSize = data?.meta.pageSize ?? 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const createMut = useMutation({
    mutationFn: () => createVehicle(form as any),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); setShowForm(false); setForm({ registrationNumber: '', name: '', category: 'car', manufacturer: '', model: '', fuelType: 'diesel', year: new Date().getFullYear(), vin: '' }); },
  });
  const delMut = useMutation({ mutationFn: (id: string) => deleteVehicle(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['vehicles'] }) });

  return (
    <PageLayout
      title="Vehicles & Assets"
      description="Manage the fleet registry, vehicle profiles, assignments and operational status."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Operations' }, { label: 'Vehicles & Assets' }]}
      actions={<Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}><Plus size={14} /> New vehicle</Button>}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search registration, name, VIN…" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]" />
          </div>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }} aria-label="Status filter">
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </div>
        <p className="text-sm text-[var(--text-muted)]">{total} vehicle{total !== 1 ? 's' : ''}</p>
      </div>

      {showForm ? (
        <Card><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Registration number" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
          <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Vehicle name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="VIN" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
          <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Manufacturer" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
          <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          <input type="number" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Year" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
          <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="car">Car</option><option value="truck">Truck</option><option value="bus">Bus</option></select>
          <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })}><option value="diesel">Diesel</option><option value="petrol">Petrol</option><option value="cng">CNG</option><option value="electric">Electric</option><option value="hybrid">Hybrid</option></select>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" disabled={createMut.isPending || !form.registrationNumber || !form.name || !form.manufacturer || !form.model} onClick={() => createMut.mutate()}>{createMut.isPending ? 'Saving…' : 'Create vehicle'}</Button>
            <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
            {createMut.isError ? <span className="text-xs text-red-600">Failed to create.</span> : null}
          </div>
        </CardContent></Card>
      ) : null}

      {isLoading ? <LoadingPanel label="Loading vehicles…" /> : null}
      {!isLoading && vehicles.length === 0 ? (
        <EmptyState
          icon={<Car size={28} />}
          title="No vehicles found"
          description={search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first vehicle to the fleet registry.'}
          action={<Button variant="primary" size="sm" onClick={() => setShowForm(true)}><Plus size={14} /> Add vehicle</Button>}
        />
      ) : null}

      {vehicles.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {vehicles.map((v) => (
              <Card key={v.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--text-primary)]">{v.registrationNumber}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">{v.name} · {v.manufacturer} {v.model}</p>
                    </div>
                    <Badge variant={v.status === 'moving' ? 'success' : v.status === 'idle' ? 'warning' : v.status === 'offline' ? 'critical' : 'neutral'} dot>{v.status}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1"><Car size={12} /> {v.category} · {v.fuelType}</span>
                    <span className="inline-flex items-center gap-1"><Gauge size={12} /> {(v.odometerKm ?? 0).toLocaleString()} km</span>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {v.city || 'Location unavailable'}</span>
                    <span>{v.year} · {v.maintenanceStatus || 'ok'}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/tracking"><Button variant="secondary" size="sm">Track</Button></Link>
                    <Link href={`/tpms/${v.id}`}><Button variant="secondary" size="sm">TPMS</Button></Link>
                    <Link href={`/engine/${v.id}`}><Button variant="secondary" size="sm">Engine</Button></Link>
                    <Button variant="danger" size="sm" disabled={delMut.isPending} onClick={() => { if (confirm('Delete this vehicle?')) delMut.mutate(v.id); }}><Trash2 size={12} /> Delete</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--text-muted)]">Page {data?.meta.page ?? page} of {data?.meta.totalPages ?? pageCount}</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="secondary" size="sm" disabled={page >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      ) : null}
    </PageLayout>
  );
}
