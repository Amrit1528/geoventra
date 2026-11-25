'use client';
import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Receipt, Wallet } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';

export default function BillingPage(): ReactElement {
  const plans = useQuery({ queryKey: ['billing-plans'], queryFn: () => apiRequest<any[]>('/billing/plans') });
  const subs = useQuery({ queryKey: ['billing-subs'], queryFn: () => apiRequest<any[]>('/billing/subscriptions') });
  const invs = useQuery({ queryKey: ['billing-invs'], queryFn: () => apiRequest<any[]>('/billing/invoices') });

  const planList = Array.isArray(plans.data) ? plans.data : [];
  const subList = Array.isArray(subs.data) ? subs.data : [];
  const invList = Array.isArray(invs.data) ? invs.data : [];
  const revenue = invList.reduce((sum: number, i: any) => sum + Number(i.amount_cents ?? 0), 0);

  return (
    <PageLayout title="Billing & subscriptions" description="Configurable plans, subscription records and invoices.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<CreditCard size={18} />} label="Plans" value={String(planList.length)} unit="available" />
        <KpiCard icon={<Wallet size={18} />} label="Subscriptions" value={String(subList.length)} unit="active" tone="positive" />
        <KpiCard icon={<Receipt size={18} />} label="Invoices" value={String(invList.length)} unit="issued" />
        <KpiCard icon={<Receipt size={18} />} label="Revenue" value={(revenue / 100).toFixed(2)} unit="INR" />
      </div>

      <Card>
        <CardHeader><CardTitle as="h2">Plans</CardTitle></CardHeader>
        <CardContent>
          {plans.isLoading && <LoadingPanel label="Loading plans…" />}
          {planList.length === 0 && !plans.isLoading ? <EmptyState title="No plans" description="Create subscription plans to offer billing tiers." icon={<CreditCard size={24} />} /> : null}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {planList.map((p: any) => (
              <div key={p.id} className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex items-center justify-between">
                  <div className="font-medium text-[var(--text-primary)]">{p.name}</div>
                  <Badge variant={p.active ? 'success' : 'neutral'}>{p.active ? 'Active' : 'Inactive'}</Badge>
                </div>
                <div className="mt-1 text-xs text-[var(--text-muted)]">{p.code}</div>
                <div className="mt-3 text-lg font-semibold">{(Number(p.price_cents ?? 0) / 100).toFixed(2)} {p.currency ?? 'INR'}</div>
                <div className="text-xs text-[var(--text-muted)]">Vehicle limit: {p.vehicle_limit ?? '—'}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Subscriptions</CardTitle></CardHeader>
          <CardContent>
            {subs.isLoading && <LoadingPanel label="Loading subscriptions…" />}
            {subList.length === 0 && !subs.isLoading ? <EmptyState title="No subscriptions" description="Subscriptions will appear when organisations subscribe to plans." icon={<Wallet size={24} />} /> : null}
            <ul className="space-y-2">
              {subList.map((s: any) => (
                <li key={s.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{s.plan_name ?? s.plan_id}</div>
                    <Badge variant={s.status === 'active' ? 'success' : s.status === 'cancelled' ? 'critical' : 'neutral'}>{s.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Invoices</CardTitle></CardHeader>
          <CardContent>
            {invs.isLoading && <LoadingPanel label="Loading invoices…" />}
            {invList.length === 0 && !invs.isLoading ? <EmptyState title="No invoices" description="Invoices will appear after billing runs." icon={<Receipt size={24} />} /> : null}
            <ul className="space-y-2">
              {invList.map((i: any) => (
                <li key={i.id} className="rounded-lg border border-[var(--border)] p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{i.status} · {(Number(i.amount_cents ?? 0) / 100).toFixed(2)}</div>
                    <Badge variant={i.status === 'paid' ? 'success' : i.status === 'overdue' ? 'critical' : 'warning'}>{i.status}</Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}