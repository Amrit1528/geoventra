'use client';
import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link2, ShieldCheck, Timer } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';

export default function DeliveryPage(): ReactElement {
  const q = useQuery({ queryKey: ['delivery-links'], queryFn: () => apiRequest<any[]>('/delivery/links') });
  const links = Array.isArray(q.data) ? q.data : [];
  const active = links.filter((l: any) => !l.revoked_at).length;
  const expired = links.filter((l: any) => l.expires_at && new Date(l.expires_at).getTime() < Date.now()).length;
  const totalAccess = links.reduce((sum: number, l: any) => sum + Number(l.access_count ?? 0), 0);

  return (
    <PageLayout title="Customer delivery tracking" description="Secure, expiring, revocable public tracking links.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Link2 size={18} />} label="Tracking links" value={String(links.length)} unit="created" />
        <KpiCard icon={<ShieldCheck size={18} />} label="Active links" value={String(active)} unit="valid" tone="positive" />
        <KpiCard icon={<Timer size={18} />} label="Expired" value={String(expired)} unit="need renewal" tone={expired ? 'warning' : 'neutral'} />
        <KpiCard icon={<Link2 size={18} />} label="Total accesses" value={String(totalAccess)} unit="views" />
      </div>

      <Card>
        <CardHeader><CardTitle as="h2">Tracking links</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading && <LoadingPanel label="Loading links…" />}
          {links.length === 0 && !q.isLoading ? <EmptyState title="No tracking links" description="Create a delivery link to share live tracking with customers." icon={<Link2 size={24} />} /> : null}
          <div className="space-y-3">
            {links.map((l: any) => {
              const expiredFlag = l.expires_at && new Date(l.expires_at).getTime() < Date.now();
              return (
                <div key={l.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-[var(--text-primary)]">{l.label ?? l.id}</div>
                    <Badge variant={l.revoked_at ? 'critical' : expiredFlag ? 'warning' : 'success'}>
                      {l.revoked_at ? 'Revoked' : expiredFlag ? 'Expired' : 'Active'}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-[var(--text-muted)]">
                    Expires {l.expires_at ? new Date(l.expires_at).toLocaleString() : '—'} · accesses {l.access_count ?? 0}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  );
}