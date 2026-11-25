'use client';

import { type ReactElement, type ReactNode, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Car, Gauge, MapPin, Pencil, Plus, RefreshCw, Search, Trash2, Power, PowerOff } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, KpiCard, LoadingPanel, PageLayout, Pagination, Select } from '@geoventra/ui';
import { createVehicle, deleteVehicle, fetchVehicles, fetchVehicle, setVehicleStatus, updateVehicle } from '@/lib/vehicles-api';
import { fetchDrivers } from '@/lib/drivers-api';
import { fetchFleetGroups } from '@/lib/admin-api';
import { invalidateFleet } from '@/lib/invalidate';
import { EntityFormModal } from '@/components/ui/EntityFormModal';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import type { VehicleDetail, VehicleStatus, VehicleSummary } from '@geoventra/contracts';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'moving', label: 'Moving' },
  { value: 'idle', label: 'Idle' },
  { value: 'stopped', label: 'Stopped' },
  { value: 'offline', label: 'Offline' },
];

const CATEGORY_OPTIONS = [
  { value: 'car', label: 'Car' },
  { value: 'light_commercial', label: 'Light commercial' },
  { value: 'truck', label: 'Truck' },
  { value: 'trailer_truck', label: 'Trailer truck' },
  { value: 'bus', label: 'Bus' },
  { value: 'van', label: 'Van' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'motorcycle', label: 'Motorcycle' },
  { value: 'tractor', label: 'Tractor' },
  { value: 'construction', label: 'Construction equipment' },
];

const FUEL_OPTIONS = [
  { value: 'diesel', label: 'Diesel' },
  { value: 'petrol', label: 'Petrol' },
  { value: 'cng', label: 'CNG' },
  { value: 'electric', label: 'Electric' },
  { value: 'hybrid', label: 'Hybrid' },
];

const OWNERSHIP_OPTIONS = [
  { value: 'company_owned', label: 'Company owned' },
  { value: 'individually_owned', label: 'Individually owned' },
  { value: 'leased', label: 'Leased' },
  { value: 'rented', label: 'Rented' },
];

const MAINTENANCE_OPTIONS = [
  { value: 'ok', label: 'OK' },
  { value: 'due_soon', label: 'Due soon' },
  { value: 'overdue', label: 'Overdue' },
  { value: 'in_service', label: 'In service' },
];

const EMPTY_VEHICLE_FORM = {
  registrationNumber: '',
  name: '',
  category: 'light_commercial',
  manufacturer: '',
  model: '',
  fuelType: 'diesel',
  year: new Date().getFullYear(),
  vin: '',
  chassisNumber: '',
  engineNumber: '',
  ownership: 'company_owned',
  city: '',
  odometerKm: 0,
  engineHours: 0,
  maintenanceStatus: 'ok',
  insuranceExpiry: '',
  registrationExpiry: '',
  notes: '',
  groupId: '',
  assignedDriverId: '',
  status: 'offline',
};

type VehicleForm = typeof EMPTY_VEHICLE_FORM;
type VehicleEditor = { mode: 'create' } | { mode: 'edit'; id: string; label: string; activeFlag: boolean };
type VehicleRecord = VehicleSummary & Partial<Pick<VehicleDetail, 'insuranceExpiry' | 'registrationExpiry' | 'notes'>>;

function categoryLabel(value: string): string {
  return CATEGORY_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

function ownershipLabel(value: string | null | undefined): string {
  return OWNERSHIP_OPTIONS.find((o) => o.value === value)?.label ?? 'Company owned';
}

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]';

function dateValue(value: unknown): string {
  return value ? String(value).slice(0, 10) : '';
}

function formFromVehicle(v: VehicleRecord): VehicleForm {
  return {
    registrationNumber: v.registrationNumber ?? '',
    name: v.name ?? '',
    category: v.category ?? 'light_commercial',
    manufacturer: v.manufacturer ?? '',
    model: v.model ?? '',
    fuelType: v.fuelType ?? 'diesel',
    year: Number(v.year) || new Date().getFullYear(),
    vin: v.vin ?? '',
    chassisNumber: v.chassisNumber ?? '',
    engineNumber: v.engineNumber ?? '',
    ownership: v.ownership ?? 'company_owned',
    city: v.city ?? '',
    odometerKm: Number(v.odometerKm) || 0,
    engineHours: Number(v.engineHours) || 0,
    maintenanceStatus: v.maintenanceStatus ?? 'ok',
    insuranceExpiry: dateValue(v.insuranceExpiry),
    registrationExpiry: dateValue(v.registrationExpiry),
    notes: v.notes ?? '',
    groupId: v.groupId ?? '',
    assignedDriverId: v.assignedDriverId ?? '',
    status: v.status ?? 'offline',
  };
}

export default function VehiclesPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const searchParams = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<'all' | VehicleStatus>((searchParams.get('status') as VehicleStatus) || 'all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editor, setEditor] = useState<VehicleEditor | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<VehicleForm>({ ...EMPTY_VEHICLE_FORM });
  const debouncedSearch = useDebouncedValue(search);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: ['vehicles', debouncedSearch, statusFilter, activeFilter, page, pageSize],
    queryFn: () => fetchVehicles({ q: debouncedSearch || undefined, status: statusFilter === 'all' ? undefined : statusFilter, active: activeFilter, page, pageSize }),
  });
  const vehicles = data?.data ?? [];
  const total = data?.meta.total ?? 0;
  const meta = data?.meta;

  const driverQuery = useQuery({ queryKey: ['drivers', 'vehicle-form'], queryFn: () => fetchDrivers({ active: 'active', pageSize: 100 }) });
  const groupQuery = useQuery({ queryKey: ['fleet-groups', 'vehicle-form'], queryFn: () => fetchFleetGroups() });
  const driverOptions = [
    { value: '', label: 'Unassigned' },
    ...(driverQuery.data?.data ?? []).map((d: any) => ({ value: d.id, label: `${d.name}${d.driverCode ? ` · ${d.driverCode}` : ''}` })),
  ];
  const groupOptions = [
    { value: '', label: 'No group' },
    ...(Array.isArray(groupQuery.data) ? groupQuery.data : (groupQuery.data as any)?.data ?? []).map((g: any) => ({ value: g.id, label: g.name ?? 'Unnamed group' })),
  ];

  function closeEditor() {
    setEditor(null);
  }

  function openCreate() {
    setForm({ ...EMPTY_VEHICLE_FORM });
    setEditor({ mode: 'create' });
  }

  async function beginEdit(vehicle: VehicleSummary) {
    setEditLoadingId(vehicle.id);
    // Load the full record first so expiry dates, notes and every other current
    // value are visible when the dialog opens.
    let detail: VehicleSummary = vehicle;
    try {
      detail = await fetchVehicle(vehicle.id);
    } catch {
      // Fall back to the list row if the detail lookup fails.
    } finally {
      setEditLoadingId(null);
    }
    setForm(formFromVehicle(detail));
    setEditor({ mode: 'edit', id: vehicle.id, label: detail.registrationNumber ?? vehicle.registrationNumber, activeFlag: Boolean(detail.activeFlag ?? vehicle.activeFlag) });
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: any = {
        ...form,
        year: Number(form.year) || undefined,
        odometerKm: Number(form.odometerKm) || 0,
        engineHours: Number(form.engineHours) || 0,
        city: form.city || null,
        groupId: form.groupId || null,
        assignedDriverId: form.assignedDriverId || null,
        insuranceExpiry: form.insuranceExpiry || null,
        registrationExpiry: form.registrationExpiry || null,
        notes: form.notes || null,
      };
      return editor?.mode === 'edit' ? updateVehicle(editor.id, payload) : createVehicle(payload);
    },
    onSuccess: () => { invalidateFleet(qc); closeEditor(); },
  });
  const delMut = useMutation({ mutationFn: (id: string) => deleteVehicle(id), onSuccess: () => { invalidateFleet(qc); setConfirmDeleteId(null); } });
  const statusMut = useMutation({ mutationFn: ({ id, activeFlag }: { id: string; activeFlag: boolean }) => setVehicleStatus(id, activeFlag), onSuccess: (_data, vars) => { invalidateFleet(qc); setActiveFilter(vars.activeFlag ? 'active' : 'inactive'); } });

  const formInvalid = !form.registrationNumber || !form.manufacturer || !form.model || saveMut.isPending;

  return (
    <PageLayout
      title="Vehicles & Assets"
      description="Manage the fleet registry, vehicle profiles, assignments and operational status."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Operations' }, { label: 'Vehicles & Assets' }]}
      actions={<Button variant="primary" size="sm" onClick={openCreate}><Plus size={14} /> New vehicle</Button>}
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
          <Select value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value as any); setPage(1); }} aria-label="Active filter">
            <option value="all">All active states</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </div>
        <div className="flex items-center justify-end gap-3">
          <p className="text-sm text-[var(--text-muted)]">{total} vehicle{total !== 1 ? 's' : ''}</p>
          <Button variant="secondary" size="sm" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
        </div>
      </div>

      <section aria-label="Vehicle summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Matching vehicles" value={total} icon={<Car size={16} />} />
        <KpiCard label="Active on page" value={vehicles.filter((v) => v.activeFlag).length} icon={<Power size={16} />} tone="positive" />
        <KpiCard label="Inactive on page" value={vehicles.filter((v) => !v.activeFlag).length} icon={<PowerOff size={16} />} />
        <KpiCard label="Moving on page" value={vehicles.filter((v) => v.status === 'moving').length} icon={<Gauge size={16} />} />
      </section>

      <EntityFormModal
        open={editor !== null}
        title={editor?.mode === 'edit' ? 'Edit vehicle' : 'Add vehicle'}
        description={editor?.mode === 'edit' ? `Update profile and assignments for ${editor.label}.` : 'Add a vehicle to the fleet registry.'}
        onClose={closeEditor}
        size="xl"
        testId="vehicle-editor"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" disabled={formInvalid} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {editor?.mode === 'edit' ? 'Save changes' : 'Create vehicle'}
            </Button>
            <Button variant="secondary" size="sm" disabled={saveMut.isPending} onClick={closeEditor}>Cancel</Button>
            {saveMut.isError ? <span className="text-xs text-red-600">{(saveMut.error as any)?.message || 'Failed to save vehicle.'}</span> : null}
          </div>
        }
      >
        {editor?.mode === 'edit' ? (
          <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Active status: <span className="font-semibold text-[var(--text-primary)]">{editor.activeFlag ? 'Active' : 'Inactive'}</span> — use the Enable/Disable actions to change it.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Registration *">
            <input className={inputClass} placeholder="MP09-DEMO-001" value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} />
          </Field>
          <Field label="Make *">
            <input className={inputClass} placeholder="Mahindra" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
          </Field>
          <Field label="Model *">
            <input className={inputClass} placeholder="Bolero Pickup" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </Field>
          <Field label="Vehicle name">
            <input className={inputClass} placeholder="Defaults to Make + Model" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Year">
            <input type="number" className={inputClass} placeholder="2024" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
          </Field>
          <Field label="Vehicle type">
            <Select aria-label="Vehicle type" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} options={CATEGORY_OPTIONS} />
          </Field>
          <Field label="Fuel">
            <Select aria-label="Fuel" value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })} options={FUEL_OPTIONS} />
          </Field>
          <Field label="Ownership">
            <Select aria-label="Ownership" value={form.ownership} onChange={(e) => setForm({ ...form, ownership: e.target.value })} options={OWNERSHIP_OPTIONS} />
          </Field>
          <Field label="VIN">
            <input className={inputClass} placeholder="VIN" value={form.vin} onChange={(e) => setForm({ ...form, vin: e.target.value })} />
          </Field>
          <Field label="Chassis number">
            <input className={inputClass} placeholder="DEMO-CHASSIS-001" value={form.chassisNumber} onChange={(e) => setForm({ ...form, chassisNumber: e.target.value })} />
          </Field>
          <Field label="Engine number">
            <input className={inputClass} placeholder="DEMO-ENGINE-001" value={form.engineNumber} onChange={(e) => setForm({ ...form, engineNumber: e.target.value })} />
          </Field>
          <Field label="City">
            <input className={inputClass} placeholder="Indore" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </Field>
          <Field label="Odometer (km)">
            <input type="number" min="0" className={inputClass} value={form.odometerKm} onChange={(e) => setForm({ ...form, odometerKm: Number(e.target.value) })} />
          </Field>
          <Field label="Engine hours">
            <input type="number" min="0" className={inputClass} value={form.engineHours} onChange={(e) => setForm({ ...form, engineHours: Number(e.target.value) })} />
          </Field>
          <Field label="Maintenance status">
            <Select aria-label="Maintenance status" value={form.maintenanceStatus} onChange={(e) => setForm({ ...form, maintenanceStatus: e.target.value })} options={MAINTENANCE_OPTIONS} />
          </Field>
          <Field label="Assigned driver">
            <Select aria-label="Assigned driver" value={form.assignedDriverId} onChange={(e) => setForm({ ...form, assignedDriverId: e.target.value })} options={driverOptions} />
          </Field>
          <Field label="Fleet group">
            <Select aria-label="Fleet group" value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} options={groupOptions} />
          </Field>
          <Field label="Insurance expiry">
            <input type="date" className={inputClass} value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} />
          </Field>
          <Field label="Registration expiry">
            <input type="date" className={inputClass} value={form.registrationExpiry} onChange={(e) => setForm({ ...form, registrationExpiry: e.target.value })} />
          </Field>
          <Field label="Operational status">
            <Select aria-label="Operational status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={STATUS_OPTIONS.filter((o) => o.value !== 'all')} />
          </Field>
          <Field label="Notes">
            <textarea rows={2} className={`${inputClass} h-auto py-2`} placeholder="Optional notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
      </EntityFormModal>

      {(error || delMut.isError || statusMut.isError || saveMut.isError) ? (
        <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-red-600">
          <span>{((error || delMut.error || statusMut.error || saveMut.error) as any)?.message || 'Vehicle action failed.'}</span>
          {error ? <Button variant="secondary" size="sm" onClick={() => void refetch()}>Retry</Button> : null}
        </CardContent></Card>
      ) : null}
      {isLoading ? <LoadingPanel label="Loading vehicles…" /> : null}
      {!isLoading && vehicles.length === 0 ? (
        <EmptyState
          icon={<Car size={28} />}
          title="No vehicles found"
          description={search || statusFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first vehicle to the fleet registry.'}
          action={<Button variant="primary" size="sm" onClick={openCreate}><Plus size={14} /> Add vehicle</Button>}
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
                    <Badge variant={v.activeFlag ? 'success' : 'neutral'}>{v.activeFlag ? 'Active' : 'Inactive'}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1"><Car size={12} /> {categoryLabel(v.category)} · {v.fuelType}</span>
                    <span className="inline-flex items-center gap-1"><Gauge size={12} /> {(v.odometerKm ?? 0).toLocaleString()} km</span>
                    <span className="inline-flex items-center gap-1"><MapPin size={12} /> {v.city || 'Location unavailable'}</span>
                    <span>{v.year} · {v.maintenanceStatus || 'ok'}</span>
                    <span title={v.chassisNumber ? `Chassis ${v.chassisNumber}` : undefined}>{ownershipLabel(v.ownership)}</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="secondary" size="sm" disabled={editLoadingId === v.id} loading={editLoadingId === v.id} onClick={() => void beginEdit(v)}><Pencil size={12} /> {editLoadingId === v.id ? 'Loading…' : 'Edit'}</Button>
                    <Link href={`/tracking?vehicle=${encodeURIComponent(v.id)}`}><Button variant="secondary" size="sm">Track</Button></Link>
                    <Link href={`/tpms/${v.id}`}><Button variant="secondary" size="sm">TPMS</Button></Link>
                    <Link href={`/engine/${v.id}`}><Button variant="secondary" size="sm">Engine</Button></Link>
                    {v.activeFlag ? (
                      <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: v.id, activeFlag: false })}><PowerOff size={12} /> Disable</Button>
                    ) : (
                      <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: v.id, activeFlag: true })}><Power size={12} /> Enable</Button>
                    )}
                    <Button variant="danger" size="sm" disabled={delMut.isPending} onClick={() => confirmDeleteId === v.id ? delMut.mutate(v.id) : setConfirmDeleteId(v.id)}><Trash2 size={12} /> {confirmDeleteId === v.id ? 'Confirm delete' : 'Delete'}</Button>
                    {confirmDeleteId === v.id ? <Button variant="secondary" size="sm" disabled={delMut.isPending} onClick={() => setConfirmDeleteId(null)}>Cancel</Button> : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {meta ? (
            <Pagination
              className="mt-4"
              page={meta.page}
              pageSize={meta.pageSize}
              total={meta.total}
              totalPages={meta.totalPages}
              itemLabel="vehicles"
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          ) : null}
        </>
      ) : null}
    </PageLayout>
  );
}
