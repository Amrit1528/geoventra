'use client';
import { type ReactElement, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout, Button, Badge } from '@geoventra/ui';
import * as api from '@/lib/integrations-api';

export default function ExternalIntegrationsPage(): ReactElement {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'providers'|'queue'|'deadletter'|'webhooks'|'analytics'>('providers');
  const providersQ = useQuery({ queryKey: ['int-providers'], queryFn: api.fetchIntegrationProviders, enabled: tab==='providers' });
  const statsQ = useQuery({ queryKey: ['int-stats'], queryFn: api.fetchQueueStats, enabled: tab==='queue' || tab==='analytics' });
  const jobsQ = useQuery({ queryKey: ['int-jobs'], queryFn: () => api.fetchQueueJobs({ pageSize: 50 }), enabled: tab==='queue' });
  const dlqQ = useQuery({ queryKey: ['int-dlq'], queryFn: () => api.fetchDeadLetter({ pageSize: 50 }), enabled: tab==='deadletter' });
  const whQ = useQuery({ queryKey: ['int-wh'], queryFn: () => api.fetchWebhooks({}), enabled: tab==='webhooks' });
  const analyticsQ = useQuery({ queryKey: ['int-analytics'], queryFn: api.fetchIntegrationAnalytics, enabled: tab==='analytics' });

  const processM = useMutation({ mutationFn: api.processQueue, onSuccess: () => { qc.invalidateQueries({ queryKey: ['int-jobs'] }); qc.invalidateQueries({ queryKey: ['int-stats'] }); } });

  const providers = providersQ.data?.data ?? [];
  const jobs = jobsQ.data?.data ?? [];
  const dlq = dlqQ.data?.data ?? [];
  const webhooks = whQ.data?.data ?? [];

  return (
    <PageLayout title="External Integrations" description="Provider credentials, queue monitoring, dead-letter and webhooks." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Administration' }, { label: 'External Integrations' }]}>
      <div className="flex flex-wrap gap-2">
        {(['providers','queue','deadletter','webhooks','analytics'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg border px-3 py-2 text-sm ${tab===t ? 'border-teal-500 bg-teal-50 text-teal-800' : 'border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]'}`}>{t}</button>
        ))}
      </div>

      {tab === 'providers' && (
        <Card><CardHeader><CardTitle>Providers</CardTitle></CardHeader><CardContent>
          {providersQ.isLoading ? <LoadingPanel label="Loading providers…"/> : providers.length === 0 ? <EmptyState title="No providers" description="No providers registered."/> :
            <div className="space-y-2">{providers.map((p: any) => (
              <div key={p.name} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3">
                <div>
                  <div className="font-medium">{p.name} <Badge variant={p.simulated ? 'info' : 'neutral'}>{p.simulated ? 'SIMULATED' : 'REAL'}</Badge></div>
                  <div className="text-xs text-[var(--text-muted)]">channel: {p.channel} · status: {p.status} · credential: {p.credential?.status ?? 'not configured'}</div>
                </div>
              </div>
            ))}</div>}
        </CardContent></Card>
      )}

      {tab === 'queue' && (
        <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Queue</CardTitle><Button size="sm" onClick={() => processM.mutate()} disabled={processM.isPending}>Process queue</Button></CardHeader><CardContent>
          {statsQ.data && <div className="grid grid-cols-2 gap-2 mb-4 text-sm">{Object.entries(statsQ.data.stats || {}).map(([k,v]) => <div key={k}><b>{k}</b>: {String(v)}</div>)}</div>}
          {jobsQ.isLoading ? <LoadingPanel label="Loading jobs…"/> : jobs.length === 0 ? <EmptyState title="No jobs" description="Queue is empty."/> :
            <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="text-left text-xs uppercase text-[var(--text-muted)]"><tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Channel</th><th className="px-3 py-2">Provider</th><th className="px-3 py-2">Attempts</th></tr></thead><tbody>{jobs.map((j: any) => <tr key={j.id} className="border-t border-[var(--border)]"><td className="px-3 py-2">{j.status}</td><td className="px-3 py-2">{j.channel}</td><td className="px-3 py-2">{j.provider}</td><td className="px-3 py-2">{j.attempts}</td></tr>)}</tbody></table></div>}
        </CardContent></Card>
      )}

      {tab === 'deadletter' && (
        <Card><CardHeader><CardTitle>Dead-letter</CardTitle></CardHeader><CardContent>
          {dlqQ.isLoading ? <LoadingPanel label="Loading…"/> : dlq.length === 0 ? <EmptyState title="No dead-letter jobs" description="None."/> :
            <div className="space-y-2">{dlq.map((j: any) => <div key={j.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">{j.id} · {j.last_error}</div>)}</div>}
        </CardContent></Card>
      )}

      {tab === 'webhooks' && (
        <Card><CardHeader><CardTitle>Webhooks</CardTitle></CardHeader><CardContent>
          {whQ.isLoading ? <LoadingPanel label="Loading…"/> : webhooks.length === 0 ? <EmptyState title="No webhook events" description="None."/> :
            <div className="space-y-2">{webhooks.map((w: any) => <div key={w.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">{w.provider} · {w.event_type} · {w.status}</div>)}</div>}
        </CardContent></Card>
      )}

      {tab === 'analytics' && (
        <Card><CardHeader><CardTitle>Analytics</CardTitle></CardHeader><CardContent>
          {analyticsQ.isLoading ? <LoadingPanel label="Loading…"/> : <pre className="text-xs">{JSON.stringify(analyticsQ.data, null, 2)}</pre>}
        </CardContent></Card>
      )}
    </PageLayout>
  );
}
