'use client';
import { type ReactElement, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Trash2, UserRound, Power, PowerOff } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, KpiCard, LoadingPanel, PageLayout, Select } from '@geoventra/ui';
import { createDriver, deleteDriver, fetchDrivers, setDriverStatus, updateDriver } from '@/lib/drivers-api';

export default function DriversPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', licenseNumber: '', licenseExpiry: '', status: 'active' });
  const q = useQuery({ queryKey: ['drivers', search, status, activeFilter, page], queryFn: () => fetchDrivers({ search: search || undefined, status: status === 'all' ? undefined : status, active: activeFilter, page, pageSize: 25 }) });
  const createMut = useMutation({ mutationFn: () => createDriver(form), onSuccess: () => { qc.invalidateQueries({ queryKey: ['drivers'] }); setFormOpen(false); setForm({ name: '', phone: '', email: '', licenseNumber: '', licenseExpiry: '', status: 'active' }); } });
  const delMut = useMutation({ mutationFn: (id: string) => deleteDriver(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }) });
  const statusMut = useMutation({ mutationFn: ({ id, activeFlag }: { id: string; activeFlag: boolean }) => setDriverStatus(id, activeFlag), onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }) });
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
        <Button variant="primary" size="sm" onClick={()=>setFormOpen(v=>!v)}><Plus size={14}/> Add driver</Button>
      </CardContent></Card>
      {formOpen ? <Card><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Full name" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Phone" value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="License number" value={form.licenseNumber} onChange={(e)=>setForm({...form,licenseNumber:e.target.value})} />
        <input type="date" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.licenseExpiry} onChange={(e)=>setForm({...form,licenseExpiry:e.target.value})} />
        <Select aria-label="Status" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})} options={[{value:'active',label:'Active'},{value:'on_leave',label:'On leave'},{value:'inactive',label:'Inactive'}]} />
        <div className="md:col-span-3 flex gap-2"><Button variant="primary" size="sm" disabled={!form.name || createMut.isPending} onClick={()=>createMut.mutate()}>{createMut.isPending?'Saving…':'Create driver'}</Button><Button variant="secondary" size="sm" onClick={()=>setFormOpen(false)}>Cancel</Button></div>
      </CardContent></Card> : null}
      {q.isLoading ? <LoadingPanel label="Loading drivers…" /> : null}
      {!q.isLoading && data.length===0 ? <EmptyState title="No drivers" description="Add drivers to assign vehicles and track performance." icon={<UserRound size={28}/>} action={<Button variant="primary" size="sm" onClick={()=>setFormOpen(true)}><Plus size={14}/> Add driver</Button>} /> : null}
      {data.length>0 ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-4 py-3">Driver</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">License</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Active</th><th className="px-4 py-3">Safety</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>
        {data.map((d:any)=>(<tr key={d.id} className="border-t border-[var(--border)]"><td className="px-4 py-3"><div className="font-medium">{d.name}</div><div className="text-xs text-[var(--text-muted)]">{d.assignedVehicleRegistration || 'Unassigned'}</div></td><td className="px-4 py-3 text-[var(--text-secondary)]"><div>{d.phone||'—'}</div><div className="text-xs">{d.email||'—'}</div></td><td className="px-4 py-3 text-[var(--text-secondary)]"><div>{d.licenseNumber||d.license_number||'—'}</div><div className="text-xs">Exp: {d.licenseExpiry||d.license_expiry||'—'}</div></td><td className="px-4 py-3"><Badge variant={d.status==='active'?'success':d.status==='on_leave'?'warning':'neutral'} dot>{d.status}</Badge></td><td className="px-4 py-3"><Badge variant={(d.activeFlag ?? d.active_flag) ? 'success' : 'neutral'}>{(d.activeFlag ?? d.active_flag) ? 'Active' : 'Inactive'}</Badge></td><td className="px-4 py-3">{d.safetyScore ?? d.safety_score ?? '—'}</td><td className="px-4 py-3"><div className="flex gap-2">{(d.activeFlag ?? d.active_flag) ? <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={()=>{if(confirm('Disable this driver?')) statusMut.mutate({id:d.id,activeFlag:false});}}><PowerOff size={12}/> Disable</Button> : <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={()=>statusMut.mutate({id:d.id,activeFlag:true})}><Power size={12}/> Enable</Button>}<Button variant="danger" size="sm" onClick={()=>{if(confirm('Delete driver?')) delMut.mutate(d.id);}}><Trash2 size={12}/> Delete</Button></div></td></tr>))}
      </tbody></table></div></CardContent></Card> : null}
    </PageLayout>
  );
}
