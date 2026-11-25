'use client';
import { type ReactElement, type ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Search, Trash2, UserRound, Power, PowerOff } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, KpiCard, LoadingPanel, PageLayout, Pagination, Select } from '@geoventra/ui';
import { createDriver, deleteDriver, fetchDriver, fetchDrivers, setDriverStatus, updateDriver } from '@/lib/drivers-api';
import { fetchVehicles } from '@/lib/vehicles-api';
import { invalidateFleet } from '@/lib/invalidate';
import { EntityFormModal } from '@/components/ui/EntityFormModal';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const LICENSE_CLASSES = ['LMV', 'LMV / Transport', 'HMV', 'HMV / Transport', 'MCWG', 'Transporter'];

const EMPTY_DRIVER_FORM = {
  driverCode: '',
  name: '',
  phone: '',
  email: '',
  licenseNumber: '',
  licenseClass: 'LMV / Transport',
  licenseExpiry: '',
  joinedAt: '',
  emergencyContact: '',
  assignedVehicleId: '',
  address: '',
  photoUrl: '',
  safetyScore: 0,
  status: 'active',
};

type DriverForm = typeof EMPTY_DRIVER_FORM;
type DriverEditor = { mode: 'create' } | { mode: 'edit'; id: string; name: string; activeFlag: boolean };

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]';

function formFromDriver(d: any): DriverForm {
  return {
    driverCode: d.driverCode ?? d.driver_code ?? '',
    name: d.name ?? '',
    phone: d.phone ?? '',
    email: d.email ?? '',
    licenseNumber: d.licenseNumber ?? d.license_number ?? '',
    licenseClass: d.licenseClass ?? d.license_class ?? '',
    licenseExpiry: d.licenseExpiry ? String(d.licenseExpiry).slice(0, 10) : '',
    joinedAt: d.joinedAt ? String(d.joinedAt).slice(0, 10) : '',
    emergencyContact: d.emergencyContact ?? d.emergency_contact ?? '',
    assignedVehicleId: d.assignedVehicleId ?? d.assigned_vehicle_id ?? '',
    address: d.address ?? '',
    photoUrl: d.photoUrl ?? d.photo_url ?? '',
    safetyScore: Number(d.safetyScore ?? d.safety_score ?? 0) || 0,
    status: d.status ?? 'active',
  };
}

export default function DriversPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editor, setEditor] = useState<DriverEditor | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<DriverForm>({ ...EMPTY_DRIVER_FORM });
  const debouncedSearch = useDebouncedValue(search);
  const q = useQuery({
    queryKey: ['drivers', debouncedSearch, status, activeFilter, page, pageSize],
    queryFn: () => fetchDrivers({ search: debouncedSearch || undefined, status: status === 'all' ? undefined : status, active: activeFilter, page, pageSize }),
  });
  const vehiclesQuery = useQuery({ queryKey: ['vehicles', 'driver-form'], queryFn: () => fetchVehicles({ active: 'active', pageSize: 100 }) });
  const vehicleOptions = [{ value: '', label: 'Unassigned' }, ...(vehiclesQuery.data?.data ?? []).map((v) => ({ value: v.id, label: `${v.registrationNumber} · ${v.name}` }))];

  function openCreate() {
    setForm({ ...EMPTY_DRIVER_FORM });
    setEditor({ mode: 'create' });
  }

  async function beginEdit(driver: any) {
    setEditLoadingId(driver.id);
    // Load the full record first so the dialog opens with every current value.
    let detail = driver;
    try {
      detail = await fetchDriver(driver.id);
    } catch {
      // Fall back to the list row; the editable fields present there are still valid.
    } finally {
      setEditLoadingId(null);
    }
    setForm(formFromDriver(detail));
    setEditor({ mode: 'edit', id: driver.id, name: detail.name ?? driver.name, activeFlag: Boolean(detail.activeFlag ?? detail.active_flag ?? driver.activeFlag ?? driver.active_flag) });
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        driverCode: form.driverCode.trim() || undefined,
        name: form.name.trim(),
        assignedVehicleId: form.assignedVehicleId || null,
        safetyScore: Number(form.safetyScore) || 0,
      };
      return editor?.mode === 'edit' ? updateDriver(editor.id, payload) : createDriver(payload);
    },
    onSuccess: () => { invalidateFleet(qc); setEditor(null); },
  });
  const delMut = useMutation({ mutationFn: (id: string) => deleteDriver(id), onSuccess: () => { invalidateFleet(qc); setConfirmDeleteId(null); } });
  const statusMut = useMutation({
    mutationFn: ({ id, activeFlag }: { id: string; activeFlag: boolean }) => setDriverStatus(id, activeFlag),
    onSuccess: (_data, vars) => { invalidateFleet(qc); setActiveFilter(vars.activeFlag ? 'active' : 'inactive'); },
  });
  const data = q.data?.data ?? [];
  const meta = q.data?.meta as any;
  return (
    <PageLayout title="Drivers" description="Manage driver profiles, assignments, license status and safety records." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Operations' }, { label: 'Drivers' }]}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<UserRound size={18} />} label="Drivers" value={String(meta?.total ?? data.length)} unit="total" />
        <KpiCard icon={<UserRound size={18} />} label="Active" value={String(data.filter((d:any)=>d.status==='active').length)} unit="on page" tone="positive" />
        <KpiCard icon={<UserRound size={18} />} label="On leave" value={String(data.filter((d:any)=>d.status==='on_leave').length)} unit="on page" tone="warning" />
        <KpiCard icon={<UserRound size={18} />} label="Inactive" value={String(data.filter((d:any)=>d.status==='inactive').length)} unit="on page" />
      </div>
      <Card><CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative max-w-md flex-1"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" /><input value={search} onChange={(e)=>{setSearch(e.target.value); setPage(1);}} placeholder="Search name, phone, email, license…" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm outline-none" /></div>
          <Select aria-label="Status" value={status} onChange={(e)=>{setStatus(e.target.value); setPage(1);}} options={[{value:'all',label:'All statuses'},{value:'active',label:'Active'},{value:'on_leave',label:'On leave'},{value:'inactive',label:'Inactive'}]} />
          <Select aria-label="Active filter" value={activeFilter} onChange={(e)=>{setActiveFilter(e.target.value as any); setPage(1);}} options={[{value:'all',label:'All active states'},{value:'active',label:'Active'},{value:'inactive',label:'Inactive'}]} />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" disabled={q.isFetching} onClick={() => void q.refetch()}><RefreshCw size={14} className={q.isFetching ? 'animate-spin' : ''}/> Refresh</Button>
          <Button variant="primary" size="sm" onClick={openCreate}><Plus size={14}/> Add driver</Button>
        </div>
      </CardContent></Card>

      <EntityFormModal
        open={editor !== null}
        title={editor?.mode === 'edit' ? 'Edit driver' : 'Add driver'}
        description={editor?.mode === 'edit' ? `Update profile and assignment for ${editor.name}.` : 'Create a driver profile and optionally assign a vehicle.'}
        onClose={() => setEditor(null)}
        size="lg"
        testId="driver-editor"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" disabled={!form.name || saveMut.isPending} loading={saveMut.isPending} onClick={() => saveMut.mutate()}>
              {editor?.mode === 'edit' ? 'Save changes' : 'Create driver'}
            </Button>
            <Button variant="secondary" size="sm" disabled={saveMut.isPending} onClick={() => setEditor(null)}>Cancel</Button>
            {saveMut.isError ? <span className="text-xs text-red-600">{(saveMut.error as any)?.message || 'Failed to save driver.'}</span> : null}
          </div>
        }
      >
        {editor?.mode === 'edit' ? (
          <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Active status: <span className="font-semibold text-[var(--text-primary)]">{editor.activeFlag ? 'Active' : 'Inactive'}</span> — use the Enable/Disable actions to change it.
          </div>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Driver ID (optional)">
            <input className={inputClass} placeholder="Auto: GV-DRV-0001" value={form.driverCode} onChange={(e)=>setForm({...form,driverCode:e.target.value})} />
          </Field>
          <Field label="Full name *">
            <input className={inputClass} placeholder="Full name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} />
          </Field>
          <Field label="Phone">
            <input className={inputClass} placeholder="+91 90000 00001" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} />
          </Field>
          <Field label="Email">
            <input type="email" className={inputClass} placeholder="driver@example.com" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} />
          </Field>
          <Field label="License number">
            <input className={inputClass} placeholder="DEMO-MP-2024-001" value={form.licenseNumber} onChange={(e)=>setForm({...form,licenseNumber:e.target.value})} />
          </Field>
          <Field label="License class">
            <input className={inputClass} list="driver-license-classes" placeholder="LMV / Transport" value={form.licenseClass} onChange={(e)=>setForm({...form,licenseClass:e.target.value})} />
            <datalist id="driver-license-classes">
              {LICENSE_CLASSES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </Field>
          <Field label="License expiry">
            <input type="date" className={inputClass} value={form.licenseExpiry} onChange={(e)=>setForm({...form,licenseExpiry:e.target.value})} />
          </Field>
          <Field label="Joining date">
            <input type="date" className={inputClass} value={form.joinedAt} onChange={(e)=>setForm({...form,joinedAt:e.target.value})} />
          </Field>
          <Field label="Emergency contact">
            <input className={inputClass} placeholder="Name · phone" value={form.emergencyContact} onChange={(e)=>setForm({...form,emergencyContact:e.target.value})} />
          </Field>
          <Field label="Assigned vehicle">
            <Select aria-label="Assigned vehicle" value={form.assignedVehicleId} onChange={(e)=>setForm({...form,assignedVehicleId:e.target.value})} options={vehicleOptions} />
          </Field>
          <Field label="Status">
            <Select aria-label="Driver status" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} options={[{value:'active',label:'Active'},{value:'on_leave',label:'On leave'},{value:'inactive',label:'Inactive'}]} />
          </Field>
          <Field label="Safety score">
            <input type="number" min="0" max="100" className={inputClass} value={form.safetyScore} onChange={(e)=>setForm({...form,safetyScore:Number(e.target.value)})} />
          </Field>
          <Field label="Address">
            <input className={inputClass} placeholder="Street, city, state" value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} />
          </Field>
          <Field label="Photo URL">
            <input className={inputClass} placeholder="https://…" value={form.photoUrl} onChange={(e)=>setForm({...form,photoUrl:e.target.value})} />
          </Field>
        </div>
      </EntityFormModal>

      {(q.error || delMut.isError || statusMut.isError || saveMut.isError) ? (
        <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-red-600">
          <span>{((q.error || delMut.error || statusMut.error || saveMut.error) as any)?.message || 'Driver action failed.'}</span>
          {q.error ? <Button variant="secondary" size="sm" onClick={() => void q.refetch()}>Retry</Button> : null}
        </CardContent></Card>
      ) : null}
      {q.isLoading ? <LoadingPanel label="Loading drivers…" /> : null}
      {!q.isLoading && data.length===0 ? <EmptyState title="No drivers" description="Add drivers to assign vehicles and track performance." icon={<UserRound size={28}/>} action={<Button variant="primary" size="sm" onClick={openCreate}><Plus size={14}/> Add driver</Button>} /> : null}
      {data.length>0 ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">License</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Active</th><th className="px-4 py-3">Safety</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>
        {data.map((d:any)=>(<tr key={d.id} className="border-t border-[var(--border)]"><td className="px-4 py-3"><div className="font-medium">{d.name}</div><div className="text-xs text-[var(--text-muted)]">{[d.driverCode, d.assignedVehicleRegistration || 'Unassigned'].filter(Boolean).join(' · ')}</div></td><td className="px-4 py-3 text-[var(--text-secondary)]"><div>{d.phone||'—'}</div><div className="text-xs">{d.email||'—'}</div>{d.emergencyContact ? <div className="text-xs text-[var(--text-muted)]">SOS: {d.emergencyContact}</div> : null}</td><td className="px-4 py-3 text-[var(--text-secondary)]"><div>{d.licenseNumber||d.license_number||'—'}</div><div className="text-xs">{d.licenseClass ? `${d.licenseClass} · ` : ''}Exp: {d.licenseExpiry||d.license_expiry||'—'}</div></td><td className="px-4 py-3 text-[var(--text-secondary)]">{(d.joinedAt||d.joined_at) ? new Date(d.joinedAt||d.joined_at).toLocaleDateString() : '—'}</td><td className="px-4 py-3"><Badge variant={d.status==='active'?'success':d.status==='on_leave'?'warning':'neutral'} dot>{d.status}</Badge></td><td className="px-4 py-3"><Badge variant={(d.activeFlag ?? d.active_flag) ? 'success' : 'neutral'}>{(d.activeFlag ?? d.active_flag) ? 'Active' : 'Inactive'}</Badge></td><td className="px-4 py-3">{d.safetyScore ?? d.safety_score ?? '—'}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={editLoadingId===d.id} loading={editLoadingId===d.id} onClick={()=>void beginEdit(d)}><Pencil size={12}/> {editLoadingId===d.id ? 'Loading…' : 'Edit'}</Button>{(d.activeFlag ?? d.active_flag) ? <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={()=>statusMut.mutate({id:d.id,activeFlag:false})}><PowerOff size={12}/> Disable</Button> : <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={()=>statusMut.mutate({id:d.id,activeFlag:true})}><Power size={12}/> Enable</Button>}{confirmDeleteId === d.id ? <><Button variant="danger" size="sm" disabled={delMut.isPending} onClick={()=>delMut.mutate(d.id)}>Confirm delete</Button><Button variant="secondary" size="sm" disabled={delMut.isPending} onClick={()=>setConfirmDeleteId(null)}>Cancel</Button></> : <Button variant="danger" size="sm" disabled={delMut.isPending} onClick={()=>setConfirmDeleteId(d.id)}><Trash2 size={12}/> Delete</Button>}</div></td></tr>))}
      </tbody></table></div></CardContent></Card> : null}
      {meta ? <Pagination className="mt-4" page={meta.page} pageSize={meta.pageSize} total={meta.total} totalPages={meta.totalPages} itemLabel="drivers" onPageChange={setPage} onPageSizeChange={(size)=>{setPageSize(size); setPage(1);}} /> : null}
    </PageLayout>
  );
}
