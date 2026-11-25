'use client';
import { type ReactElement, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageLayout, Card, CardContent, CardHeader, CardTitle, LoadingPanel, EmptyState, Button } from '@geoventra/ui';
import { fetchDispatches, createDispatch, updateDispatchStatus } from '@/lib/dispatch-api';

export default function DispatchPage(): ReactElement {
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ pickupLabel: '', destinationLabel: '', priority: 'normal' });
  const q = useQuery({ queryKey: ['dispatches'], queryFn: () => fetchDispatches() });
  const createMut = useMutation({ mutationFn: () => createDispatch(form), onSuccess: () => { qc.invalidateQueries({ queryKey: ['dispatches'] }); setShow(false); setForm({ pickupLabel: '', destinationLabel: '', priority: 'normal' }); } });
  const data = q.data?.data ?? [];
  return (
    <PageLayout title="Dispatch" description="Dispatch requests and assignment status." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Operations' }, { label: 'Dispatch' }]}>
      <div className="flex justify-end"><Button variant="primary" size="sm" onClick={() => setShow((v) => !v)}>New request</Button></div>
      {show ? <Card><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Pickup" value={form.pickupLabel} onChange={(e) => setForm({ ...form, pickupLabel: e.target.value })} />
        <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Destination" value={form.destinationLabel} onChange={(e) => setForm({ ...form, destinationLabel: e.target.value })} />
        <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select>
        <div className="md:col-span-3"><Button variant="primary" size="sm" onClick={() => createMut.mutate()}>Create</Button></div>
      </CardContent></Card> : null}
      {q.isLoading ? <LoadingPanel label="Loading dispatches…" /> : null}
      {!q.isLoading && data.length === 0 ? <EmptyState title="No dispatch requests" description="Create a dispatch request to begin." /> : null}
      {data.length > 0 ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]"><tr><th className="px-4 py-3">Number</th><th className="px-4 py-3">Pickup</th><th className="px-4 py-3">Destination</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr></thead><tbody>
        {data.map((d: any) => (<tr key={d.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-medium">{d.request_number}</td><td className="px-4 py-3">{d.pickup_label || '—'}</td><td className="px-4 py-3">{d.destination_label || '—'}</td><td className="px-4 py-3">{d.priority}</td><td className="px-4 py-3">{d.status}</td><td className="px-4 py-3"><Button variant="secondary" size="sm" onClick={() => updateDispatchStatus(d.id, 'completed').then(() => qc.invalidateQueries({ queryKey: ['dispatches'] }))}>Complete</Button></td></tr>))}
      </tbody></table></div></CardContent></Card> : null}
    </PageLayout>
  );
}
