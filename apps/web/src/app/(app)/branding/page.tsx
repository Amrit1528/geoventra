'use client';
import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Palette } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, LoadingPanel, PageLayout } from '@geoventra/ui';

export default function BrandingPage(): ReactElement {
  const q = useQuery({ queryKey: ['branding'], queryFn: () => apiRequest<any>('/branding') });
  const data = q.data ?? {};

  return (
    <PageLayout title="Tenant branding" description="Logo, colors, company name and customer-facing domain.">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">Brand identity</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {q.isLoading && <LoadingPanel label="Loading branding…" />}
            <div>
              <div className="text-xs text-[var(--text-muted)]">Company name</div>
              <div className="font-medium text-[var(--text-primary)]">{data.company_name ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">Custom domain</div>
              <div className="font-medium text-[var(--text-primary)]">{data.custom_domain ?? '—'}</div>
            </div>
            <div>
              <div className="text-xs text-[var(--text-muted)]">Logo URL</div>
              <div className="font-medium text-[var(--text-primary)] break-all">{data.logo_url ?? '—'}</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle as="h2">Color palette</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {q.isLoading && <LoadingPanel label="Loading colors…" />}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg border border-[var(--border)]" style={{ backgroundColor: data.primary_color ?? '#0d9488' }} />
              <div>
                <div className="text-sm font-medium">Primary</div>
                <div className="text-xs text-[var(--text-muted)]">{data.primary_color ?? '—'}</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg border border-[var(--border)]" style={{ backgroundColor: data.secondary_color ?? '#0f172a' }} />
              <div>
                <div className="text-sm font-medium">Secondary</div>
                <div className="text-xs text-[var(--text-muted)]">{data.secondary_color ?? '—'}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}