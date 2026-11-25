'use client';
import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Handshake, Percent } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';

export default function PartnersPage(): ReactElement {
  const q = useQuery({ queryKey: ['partners'], queryFn: () => apiRequest<any[]>('/partners') });
  const partners = Array.isArray(q.data) ? q.data : [];
  const active = partners.filter((p: any) => p.status === 'active').length;
  const avgCommission = partners.length ? partners.reduce((sum: number, p: any) => sum + Number(p.commission_rate ?? 0), 0) / partners.length : 0;

  return (
    <PageLayout title="Partners & installers" description="Installer/reseller records, onboarding and commissions.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Handshake size={18} />} label="Partners" value={String(partners.length)} unit="registered" />
        <KpiCard icon={<Handshake size={18} />} label="Active" value={String(active)} unit="operating" tone="positive" />
        <KpiCard icon={<Percent size={18} />} label="Avg commission" value={avgCommission.toFixed(1)} unit="%" />
        <KpiCard icon={<Handshake size={18} />} label="Installers" value={String(partners.filter((p: any) => p.partner_type === 'installer').length)} unit="field" />
      </div>

      <Card>
        <CardHeader><CardTitle as="h2">Partners</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading && <LoadingPanel label="Loading partners…" />}
          {partners.length === 0 && !q.isLoading ? <EmptyState title="No partners" description="Add installer or reseller partners to track onboarding and commissions." icon={<Handshake size={24} />} /> : null}
          <div className="space-y-3">
            {partners.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-medium text-[var(--text-primary)]">{p.name}</div>
                    <div className="text-xs text-[var(--text-muted)]">{p.partner_type} · {p.contact_name ?? '—'} · {p.contact_email ?? '—'}</div>
                  </div>
                  <Badge variant={p.status === 'active' ? 'success' : 'neutral'}>{p.status}</Badge>
                </div>
                <div className="mt-2 text-xs text-[var(--text-secondary)]">Commission: {Number(p.commission_rate ?? 0).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageLayout>
  );
}