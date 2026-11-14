'use client';

import { type ReactElement, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CalendarClock, ClipboardList, Plus, ShieldAlert, TimerReset, Wrench } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import {
  createMaintenance,
  createServiceSchedule,
  fetchMaintenance,
  fetchMaintenanceDowntime,
  fetchMaintenanceHealthScores,
  fetchMaintenancePredictions,
  fetchMaintenanceSummary,
  fetchServiceSchedules,
  fetchWorkOrders,
} from '@/lib/maintenance-api';

type Tab = 'records' | 'schedules' | 'predictions' | 'work-orders' | 'health' | 'downtime';

export default function MaintenancePage(): ReactElement {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('records');
  const [open, setOpen] = useState(false);
  const [openSchedule, setOpenSchedule] = useState(false);
  const [form, setForm] = useState({ vehicleId: '', type: 'service', description: '', vendor: '', performedAt: new Date().toISOString().slice(0, 10), status: 'completed', cost: '' });
  const [sched, setSched] = useState({ vehicleId: '', name: '', intervalKm: '', intervalDays: '', intervalEngineHours: '', nextDueAt: '', status: 'ok', notes: '' });

  const sumQ = useQuery({ queryKey: ['maintenance-summary'], queryFn: fetchMaintenanceSummary });
  const listQ = useQuery({ queryKey: ['maintenance'], queryFn: () => fetchMaintenance({ page: 1, pageSize: 50 }), enabled: tab === 'records' });
  const schedulesQ = useQuery({ queryKey: ['maintenance-schedules'], queryFn: fetchServiceSchedules, enabled: tab === 'schedules' });
  const predQ = useQuery({ queryKey: ['maintenance-predictions'], queryFn: fetchMaintenancePredictions, enabled: tab === 'predictions' });
  const woQ = useQuery({ queryKey: ['maintenance-work-orders'], queryFn: fetchWorkOrders, enabled: tab === 'work-orders' });
  const healthQ = useQuery({ queryKey: ['maintenance-health'], queryFn: fetchMaintenanceHealthScores, enabled: tab === 'health' });
  const downQ = useQuery({ queryKey: ['maintenance-downtime'], queryFn: fetchMaintenanceDowntime, enabled: tab === 'downtime' });

  const createMut = useMutation({ mutationFn: () => createMaintenance({ ...form, cost: form.cost ? Number(form.cost) : null }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance'] }); qc.invalidateQueries({ queryKey: ['maintenance-summary'] }); setOpen(false); } });
  const createSchedMut = useMutation({ mutationFn: () => createServiceSchedule({ ...sched, intervalKm: sched.intervalKm ? Number(sched.intervalKm) : null, intervalDays: sched.intervalDays ? Number(sched.intervalDays) : null, intervalEngineHours: sched.intervalEngineHours ? Number(sched.intervalEngineHours) : null, nextDueAt: sched.nextDueAt || null }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['maintenance-schedules'] }); qc.invalidateQueries({ queryKey: ['maintenance-summary'] }); setOpenSchedule(false); } });

  const rows = listQ.data?.data ?? [];
  const sum = sumQ.data ?? {};
  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'records', label: 'Service history' }, { id: 'schedules', label: 'Schedules' }, { id: 'predictions', label: 'Predictive indicators' },
    { id: 'work-orders', label: 'Work orders' }, { id: 'health', label: 'Component health' }, { id: 'downtime', label: 'Downtime' },
  ];

  return (
    <PageLayout
      title="Maintenance"
      description="Service schedules, preventive and predictive maintenance indicators, service history, work orders, component health and downtime tracking."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Operations' }, { label: 'Maintenance' }]}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Wrench size={18} />} label="Maintenance records" value={String(sum.total ?? rows.length)} unit="total" />
        <KpiCard icon={<CalendarClock size={18} />} label="Schedules overdue / due soon" value={`${sum.schedules?.overdue ?? 0} / ${sum.schedules?.dueSoon ?? 0}`} unit="vehicles" tone={(sum.schedules?.overdue ?? 0) > 0 ? 'warning' : 'neutral'} />
        <KpiCard icon={<ShieldAlert size={18} />} label="High-risk predictions" value={String(sum.predictions?.highRisk ?? 0)} unit={`/ ${sum.predictions?.total ?? 0} active`} tone={(sum.predictions?.highRisk ?? 0) > 0 ? 'warning' : 'positive'} />
        <KpiCard icon={<ClipboardList size={18} />} label="Open work orders" value={String(sum.workOrders?.open ?? 0)} unit={`/ ${sum.workOrders?.total ?? 0}`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button key={t.id} type="button" onClick={() => setTab(t.id)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${tab === t.id ? 'bg-teal-600 text-white' : 'bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'}`}>{t.label}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {tab === 'records' ? <Button variant="primary" size="sm" onClick={() => setOpen((v) => !v)}><Plus size={14} /> Add record</Button> : null}
          {tab === 'schedules' ? <Button variant="primary" size="sm" onClick={() => setOpenSchedule((v) => !v)}><Plus size={14} /> Add schedule</Button> : null}
        </div>
      </div>

      {tab === 'records' ? (
        <>
          {open ? <Card><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Vehicle ID (UUID)" value={form.vehicleId} onChange={(e) => setForm({ ...form, vehicleId: e.target.value })} />
            <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="service">Service</option><option value="repair">Repair</option><option value="inspection">Inspection</option></select>
            <select className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="completed">Completed</option><option value="scheduled">Scheduled</option><option value="cancelled">Cancelled</option></select>
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm md:col-span-2" placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Vendor" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} />
            <input type="date" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={form.performedAt} onChange={(e) => setForm({ ...form, performedAt: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Cost" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
            <div className="md:col-span-3 flex gap-2"><Button variant="primary" size="sm" disabled={!form.vehicleId || !form.description || createMut.isPending} onClick={() => createMut.mutate()}>{createMut.isPending ? 'Saving…' : 'Save record'}</Button><Button variant="secondary" size="sm" onClick={() => setOpen(false)}>Cancel</Button></div>
          </CardContent></Card> : null}
          {listQ.isLoading ? <LoadingPanel label="Loading maintenance records…" /> : null}
          {!listQ.isLoading && rows.length === 0 ? <EmptyState title="No maintenance records" description="Add service, repair and inspection records for your fleet." icon={<Wrench size={28} />} /> : null}
          {rows.length > 0 ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Description</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{rows.map((r: any) => (<tr key={r.id} className="border-t border-[var(--border)]"><td className="px-4 py-3"><div className="font-medium">{r.vehicleRegistration || r.vehicleId}</div><div className="text-xs text-[var(--text-muted)]">{r.vehicleName || ''}</div></td><td className="px-4 py-3 capitalize">{r.type}</td><td className="px-4 py-3">{r.description}</td><td className="px-4 py-3">{r.performedAt ? new Date(r.performedAt).toLocaleDateString() : '—'}</td><td className="px-4 py-3">{r.cost ?? '—'}</td><td className="px-4 py-3"><Badge variant={r.status === 'completed' ? 'success' : r.status === 'scheduled' ? 'warning' : 'neutral'}>{r.status}</Badge></td></tr>))}</tbody></table></div></CardContent></Card> : null}
        </>
      ) : null}

      {tab === 'schedules' ? (
        <>
          {openSchedule ? <Card><CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Vehicle ID (UUID)" value={sched.vehicleId} onChange={(e) => setSched({ ...sched, vehicleId: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm md:col-span-2" placeholder="Schedule name (e.g. Oil change)" value={sched.name} onChange={(e) => setSched({ ...sched, name: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Interval km" value={sched.intervalKm} onChange={(e) => setSched({ ...sched, intervalKm: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Interval days" value={sched.intervalDays} onChange={(e) => setSched({ ...sched, intervalDays: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Interval engine hours" value={sched.intervalEngineHours} onChange={(e) => setSched({ ...sched, intervalEngineHours: e.target.value })} />
            <input type="date" className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" value={sched.nextDueAt} onChange={(e) => setSched({ ...sched, nextDueAt: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm md:col-span-2" placeholder="Notes" value={sched.notes} onChange={(e) => setSched({ ...sched, notes: e.target.value })} />
            <div className="md:col-span-3 flex gap-2"><Button variant="primary" size="sm" disabled={!sched.vehicleId || !sched.name || createSchedMut.isPending} onClick={() => createSchedMut.mutate()}>{createSchedMut.isPending ? 'Saving…' : 'Save schedule'}</Button><Button variant="secondary" size="sm" onClick={() => setOpenSchedule(false)}>Cancel</Button></div>
          </CardContent></Card> : null}
          {schedulesQ.isLoading ? <LoadingPanel label="Loading schedules…" /> : null}
          {(schedulesQ.data?.data ?? []).length === 0 && !schedulesQ.isLoading ? <EmptyState title="No service schedules" description="Create odometer, time or engine-hour based maintenance schedules and reminders." icon={<CalendarClock size={28} />} /> : null}
          {(schedulesQ.data?.data ?? []).length > 0 ? <Card><CardContent className="p-0"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Schedule</th><th className="px-4 py-3">Interval</th><th className="px-4 py-3">Next due</th><th className="px-4 py-3">Status</th></tr></thead><tbody>{(schedulesQ.data?.data ?? []).map((s: any) => (<tr key={s.id} className="border-t border-[var(--border)]"><td className="px-4 py-3"><div className="font-medium">{s.vehicleRegistration || s.vehicleId}</div><div className="text-xs text-[var(--text-muted)]">{s.vehicleName || ''}</div></td><td className="px-4 py-3">{s.name}</td><td className="px-4 py-3 text-[var(--text-secondary)]">{[s.intervalKm ? `${s.intervalKm} km` : null, s.intervalDays ? `${s.intervalDays} days` : null, s.intervalEngineHours ? `${s.intervalEngineHours} eng-hrs` : null].filter(Boolean).join(' · ') || '—'}</td><td className="px-4 py-3">{s.nextDueAt ? new Date(s.nextDueAt).toLocaleDateString() : (s.nextDueKm != null ? `${s.nextDueKm} km` : '—')}</td><td className="px-4 py-3"><Badge variant={s.status === 'overdue' ? 'critical' : s.status === 'due_soon' ? 'warning' : s.status === 'in_service' ? 'info' : 'success'}>{String(s.status || 'ok').replace('_', ' ')}</Badge></td></tr>))}</tbody></table></div></CardContent></Card> : null}
        </>
      ) : null}

      {tab === 'predictions' ? (
        <Card><CardHeader><CardTitle>Predictive maintenance indicators</CardTitle><p className="mt-1 text-xs text-[var(--text-muted)]">Rule/model-based indicators from available telemetry and history. These are not confirmed diagnoses.</p></CardHeader><CardContent>
          {predQ.isLoading ? <LoadingPanel label="Loading predictions…" /> : null}
          {(predQ.data?.data ?? []).length === 0 && !predQ.isLoading ? <EmptyState title="No active predictive indicators" description="Predictions appear when sufficient telemetry/history is available and rules produce indicators." icon={<Activity size={28} />} /> : (
            <div className="space-y-3">{(predQ.data?.data ?? []).map((p: any) => (
              <div key={p.id} className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><div className="font-semibold text-[var(--text-primary)]">{p.issueTitle || p.predictedIssue}</div><div className="text-xs text-[var(--text-muted)]">{p.vehicleRegistration || p.vehicleId} · {p.category} · confidence {(Number(p.confidence ?? 0) * 100).toFixed(0)}%</div></div>
                  <div className="flex gap-2"><Badge variant={p.riskLevel === 'critical' ? 'critical' : p.riskLevel === 'high' ? 'warning' : 'neutral'}>{p.riskLevel}</Badge><Badge variant="info">{p.sourceClassification || 'indicator'}</Badge></div>
                </div>
                {p.description ? <p className="mt-2 text-sm text-[var(--text-secondary)]">{p.description}</p> : null}
                {p.recommendedAction ? <p className="mt-2 text-sm"><span className="font-medium">Recommended:</span> {p.recommendedAction}</p> : null}
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-[var(--text-muted)]">
                  {p.recommendedServiceDate ? <span>Suggested service: {new Date(p.recommendedServiceDate).toLocaleDateString()}</span> : null}
                  {p.estimatedRemainingDistanceKm != null ? <span>Est. remaining: {Number(p.estimatedRemainingDistanceKm).toLocaleString()} km</span> : null}
                  {p.modelVersion ? <span>Model: {p.modelVersion}</span> : null}
                </div>
              </div>
            ))}</div>
          )}
        </CardContent></Card>
      ) : null}

      {tab === 'work-orders' ? (
        <Card><CardHeader><CardTitle>Work orders</CardTitle></CardHeader><CardContent>
          {woQ.isLoading ? <LoadingPanel label="Loading work orders…" /> : null}
          {(woQ.data?.data ?? []).length === 0 && !woQ.isLoading ? <EmptyState title="No work orders" description="Work orders track scheduled and in-progress maintenance execution, labour/parts costs and completion." icon={<ClipboardList size={28} />} /> : (
            <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-4 py-3">Order</th><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Issue</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Cost</th></tr></thead><tbody>{(woQ.data?.data ?? []).map((w: any) => (<tr key={w.id} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-medium">{w.workOrderNumber}</td><td className="px-4 py-3">{w.vehicleRegistration || w.vehicleId}</td><td className="px-4 py-3">{w.issueDescription || w.category}</td><td className="px-4 py-3"><Badge variant={w.priority === 'critical' ? 'critical' : w.priority === 'high' ? 'warning' : 'neutral'}>{w.priority}</Badge></td><td className="px-4 py-3"><Badge variant={w.status === 'completed' ? 'success' : w.status === 'in_progress' ? 'info' : 'neutral'}>{String(w.status).replace('_', ' ')}</Badge></td><td className="px-4 py-3">{w.totalCost != null ? Number(w.totalCost).toLocaleString() : '—'}</td></tr>))}</tbody></table></div>
          )}
        </CardContent></Card>
      ) : null}

      {tab === 'health' ? (
        <Card><CardHeader><CardTitle>Component / vehicle health scores</CardTitle></CardHeader><CardContent>
          {healthQ.isLoading ? <LoadingPanel label="Loading health scores…" /> : null}
          {(healthQ.data?.data ?? []).length === 0 && !healthQ.isLoading ? <EmptyState title="No health scores available" description="Vehicle health scores appear when maintenance/diagnostic scoring data is computed for vehicles." icon={<Activity size={28} />} /> : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{(healthQ.data?.data ?? []).map((h: any) => (
              <div key={h.vehicleId} className="rounded-xl border border-[var(--border)] p-4">
                <div className="flex items-start justify-between gap-2"><div><div className="font-semibold">{h.vehicleRegistration || h.vehicleId}</div><div className="text-xs text-[var(--text-muted)]">{h.vehicleName || ''}</div></div><Badge variant={h.grade === 'critical' || h.grade === 'poor' ? 'critical' : h.grade === 'attention' ? 'warning' : 'success'}>{h.grade || 'unknown'}</Badge></div>
                <div className="mt-3 text-3xl font-bold text-[var(--text-primary)]">{h.score ?? '—'}<span className="text-sm font-medium text-[var(--text-muted)]">/100</span></div>
                <div className="mt-1 text-xs text-[var(--text-secondary)]">Calculated {h.calculatedAt ? new Date(h.calculatedAt).toLocaleString() : '—'} · confidence {h.confidence != null ? `${(Number(h.confidence) * 100).toFixed(0)}%` : '—'}</div>
              </div>
            ))}</div>
          )}
        </CardContent></Card>
      ) : null}

      {tab === 'downtime' ? (
        <Card><CardHeader><CardTitle><span className="inline-flex items-center gap-2"><TimerReset size={16} />Vehicle downtime tracking</span></CardTitle></CardHeader><CardContent>
          {downQ.isLoading ? <LoadingPanel label="Loading downtime…" /> : null}
          {(downQ.data?.data ?? []).length === 0 && !downQ.isLoading ? <EmptyState title="No downtime data" description="Downtime is derived from maintenance work order schedules and execution windows." icon={<TimerReset size={28} />} /> : (
            <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-[var(--bg-app)] text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-4 py-3">Vehicle</th><th className="px-4 py-3">Work orders</th><th className="px-4 py-3">Active downtime</th><th className="px-4 py-3">Total downtime</th></tr></thead><tbody>{(downQ.data?.data ?? []).map((d: any, i: number) => (<tr key={d.vehicleId ?? i} className="border-t border-[var(--border)]"><td className="px-4 py-3 font-medium">{d.vehicleRegistration || d.vehicleId}</td><td className="px-4 py-3">{d.workOrders ?? 0}</td><td className="px-4 py-3">{d.activeDowntime ?? 0}</td><td className="px-4 py-3">{Math.round(Number(d.totalDowntimeSeconds ?? 0) / 3600)} h</td></tr>))}</tbody></table></div>
          )}
        </CardContent></Card>
      ) : null}
    </PageLayout>
  );
}
