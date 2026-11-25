'use client';
import { type ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Activity, Brain, PlayCircle } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';

export default function InsightsPage(): ReactElement {
  const qc = useQueryClient();
  const rulesQ = useQuery({ queryKey: ['insights-rules'], queryFn: () => apiRequest<any[]>('/insights/rules') });
  const eventsQ = useQuery({ queryKey: ['insights-events'], queryFn: () => apiRequest<any>('/insights/events') });
  const evalM = useMutation({ mutationFn: () => apiRequest<any>('/insights/evaluate', { method: 'POST' }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['insights-events'] }); } });

  const events = eventsQ.data?.data ?? [];
  const rules = Array.isArray(rulesQ.data) ? rulesQ.data : [];
  const openEvents = events.filter((e: any) => e.status === 'open').length;
  const criticalEvents = events.filter((e: any) => e.severity === 'critical').length;

  return (
    <PageLayout title="Operational insights" description="Explainable fleet insight events and rules.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Brain size={18} />} label="Insight rules" value={String(rules.length)} unit="configured" />
        <KpiCard icon={<Activity size={18} />} label="Insight events" value={String(events.length)} unit="generated" tone="positive" />
        <KpiCard icon={<Activity size={18} />} label="Open events" value={String(openEvents)} unit="need review" tone={openEvents ? 'warning' : 'neutral'} />
        <KpiCard icon={<Activity size={18} />} label="Critical" value={String(criticalEvents)} unit="high priority" tone={criticalEvents ? 'warning' : 'neutral'} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => evalM.mutate()} disabled={evalM.isPending} loading={evalM.isPending}>
          <PlayCircle size={14} /> Evaluate now
        </Button>
        {evalM.isSuccess ? <span className="text-xs text-emerald-600">Evaluation complete.</span> : null}
        {evalM.isError ? <span className="text-xs text-red-600">Evaluation failed.</span> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Insight rules</CardTitle></CardHeader>
          <CardContent>
            {rulesQ.isLoading && <LoadingPanel label="Loading rules…" />}
            {rules.length === 0 && !rulesQ.isLoading ? <EmptyState title="No insight rules" description="Configure rules to generate explainable fleet insights." icon={<Brain size={24} />} /> : null}
            <ul className="space-y-2">
              {rules.map((r: any) => (
                <li key={r.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-[var(--text-primary)]">{r.name ?? r.rule_type ?? r.id}</div>
                    <Badge variant={r.enabled === false ? 'neutral' : 'success'}>{r.enabled === false ? 'Disabled' : 'Active'}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{r.description ?? r.rule_type ?? ''}</div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Insight events</CardTitle></CardHeader>
          <CardContent>
            {eventsQ.isLoading && <LoadingPanel label="Loading events…" />}
            {events.length === 0 && !eventsQ.isLoading ? <EmptyState title="No insight events" description="Run evaluation to generate insight events." icon={<Activity size={24} />} /> : null}
            <ul className="space-y-2">
              {events.map((e: any) => (
                <li key={e.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-[var(--text-primary)]">{e.title}</div>
                    <Badge variant={e.severity === 'critical' ? 'critical' : e.severity === 'high' ? 'warning' : 'neutral'}>{e.severity}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">{e.status} · {e.occurred_at ? new Date(e.occurred_at).toLocaleString() : '—'}</div>
                  {e.description && <div className="mt-1 text-xs text-[var(--text-secondary)]">{e.description}</div>}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}