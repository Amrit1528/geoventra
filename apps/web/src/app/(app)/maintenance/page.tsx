'use client';
import { type ReactElement, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Wrench } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import { createMaintenance, fetchMaintenance, fetchMaintenanceSummary } from '@/lib/maintenance-api';

export default function MaintenancePage(): ReactElement {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ vehicleId: '', type: 'service', description: '', vendor: '', performedAt: new Date().toISOString().slice(0,10), status: 'completed', cost: '' });
  const listQ = useQuery({ queryKey: ['maintenance'], queryFn: () => fetchMaintenance({ page:1, pageSize:50 }) });
  const sumQ = useQuery({ queryKey: ['maintenance-summary'], queryFn: fetchMaintenanceSummary });
  const createMut = useMutation({ mutationFn: () => createMaintenance({ ...form, cost: form.cost ? Number(form.cost) : null }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['maintenance-summary'] }); setOpen(false); } });
  const rows = listQ.data?.data ?? [];
  const sum = sumQ.data ?? {};
  return (
    <PageLayout title="Maintenance" description="Track service records, repairs and vehicle maintenance history." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Operations' }, { label: 'Maintenance' }]}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Wrench size={18} />} label="Records" value={String(sum.total ?? rows.length)} unit="total" />
        <KpiCard icon={<Wrench size={18} />} label="Completed" value={String(sum.completed ?? 0)} unit="services" tone="positive" />
        <KpiCard icon={<Wrench size={18} />} label="Scheduled" value={String(sum.scheduled ?? 0)} unit="planned" tone="warning" />
        <KpiCard icon={<Wrench size={18} />} label="Cancelled" value={String(sum.cancelled ?? 0)} unit="records" />
      </div>
      <div className="flex justify-end"><Button variant="primary" size="sm" onClick={()=>setOpen(v=>!v)}><Plus size={14}/> Add record</Button></div>
      {open ? <Card><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Vehicle ID (UUID)" value={form.vehicleId} onChange={(e)=>setForm({...form,vehicleId:e.target.value})} />
        <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.type} onChange={(e)=>setForm({...form,type:e.target.value})}><option value="service">Service</option><option value="repair">Repair</option><option value="inspection">Inspection</option></select>
        <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value})}><option value="completed">Completed</option><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option></select>
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm md:col-span-2" placeholder="Description" value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Vendor" value={form.vendor} onChange={(e)=>setForm({...form,vendor:e.target.value})} />
        <input type="date" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.performedAt} onChange={(e)=>setForm({...form,performedAt:e.target.value})} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Cost" value={form.cost} onChange={(e)=>setForm({...form,cost:e.target.value})} />
        <div className="md:col-span-3 flex gap-2"><Button variant="primary" size="sm" disabled={!form.vehicleId || !form.description || createMut.isPending} onClick={()=>createMut.mutate()}>{createMut.isPending?'Saving…':'Save record'}</Button><Button variant="secondary" size="sm" onClick={()=>setOpen(false)}>Cancel</Button>{createMut.isError?<span className="text-sm text-red-600">Failed to save.</span>:null}</div>
      </CardContent></Card> : null}
      {listQ.isLoading ? <LoadingPanel label="Loading maintenance records…" /> : null}
      {!listQ.isLoading && rows.length===0 ? <EmptyState title="No maintenance records" description="Add service, repair and inspection records for your fleet." icon={<Wrench size={28}/>} action={<Button variant="primary" size="sm" onClick={()=>setOpen(true)}><Plus size={14}/> Add record</Button>} /> : null}
      {rows.length>0 ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{rows.map((r:any)=>(<tr key={r.id} className="border-t border-[var(--border)]"><td className="px-4 py-3"><div className="font-medium">{r.vehicleRegistration||r.vehicleId}</div><div className="text-xs text-[var(--text-muted)]">{r.vehicleName||''}</div></td><td className="px-4 py-3 capitalize">{r.type}</td><td className="px-4 py-3">{r.description}</td><td className="px-4 py-3">{r.performedAt ? new Date(r.performedAt).toLocaleDateString() : '—'}</td><td className="px-4 py-3">{r.cost ?? '—'}</td><td className="px-4 py-3"><Badge variant={r.status==='completed'?'success':r.status==='scheduled'?'warning':'neutral'}>{r.status}</Badge></td></tr>))}</tbody></table></div></CardContent></Card> : null}
    </PageLayout>
  );
}
