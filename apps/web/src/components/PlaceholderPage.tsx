import type { ReactElement } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Card, CardContent, PageLayout, Badge } from '@geoventra/ui';

export interface PlaceholderPageBreadcrumb {
  label: string;
  href?: string;
}

export interface PlaceholderPageProps {
  title: string;
  description: string;
  phase: string;
  features: string[];
  breadcrumb?: PlaceholderPageBreadcrumb[];
}

function inferBreadcrumb(title: string): PlaceholderPageBreadcrumb[] {
  const groups: Record<string, string> = {
    Dashboard: 'Overview',
    'Live Fleet': 'Overview',
    'Alerts & Incidents': 'Overview',
    'Vehicles & Assets': 'Fleet Operations',
    Drivers: 'Fleet Operations',
    Devices: 'Fleet Operations',
    'Trips & Routes': 'Fleet Operations',
    Geofences: 'Fleet Operations',
    'Engine Health': 'Vehicle Intelligence',
    'TPMS & Tyre Health': 'Vehicle Intelligence',
    Maintenance: 'Vehicle Intelligence',
    'Reports & Analytics': 'Business',
    Administration: 'Business',
    'Customers & Users': 'Business',
  };
  const group = groups[title];
  return [{ label: 'Geoventra', href: '/' }, ...(group ? [{ label: group }] : []), { label: title }];
}

export function PlaceholderPage({ title, description, phase, features, breadcrumb }: PlaceholderPageProps): ReactElement {
  return (
    <PageLayout
      title={title}
      description={description}
      breadcrumb={breadcrumb ?? inferBreadcrumb(title)}
    >
      <div className="grid gap-5 xl:grid-cols-[1.2fr,1fr]">
        <Card className="overflow-hidden">
          <div className="border-b border-[var(--border)] bg-gradient-to-r from-teal-50 to-emerald-50 px-5 py-5 dark:from-teal-950/20 dark:to-emerald-950/10">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="info" dot>Module roadmap</Badge>
              <Badge variant="neutral">{phase}</Badge>
            </div>
            <h2 className="mt-3 text-lg font-semibold text-[var(--text-primary)]">{title} experience</h2>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-secondary)]">
              This module is part of the Geoventra platform vision. The interface below outlines the planned capabilities and data surfaces for this area.
            </p>
          </div>
          <CardContent>
            <ul className="space-y-3">
              {features.map((feature) => (
                <li key={feature} className="flex items-start gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                  <span className="mt-0.5 inline-flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-800/50">
                    <Sparkles size={14} />
                  </span>
                  <span className="text-sm text-[var(--text-primary)]">{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">What to expect</h3>
            <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
              Geoventra is being evolved into a premium fleet operations and vehicle intelligence platform. Available data and controls in this module will appear here as their APIs and workflows are enabled.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <a href="/tracking" className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 hover:border-teal-300 hover:bg-[var(--bg-surface-hover)]">
                <span>Open Live Fleet</span><ArrowRight size={14} className="text-[var(--text-muted)]" />
              </a>
              <a href="/" className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 hover:border-teal-300 hover:bg-[var(--bg-surface-hover)]">
                <span>View Dashboard</span><ArrowRight size={14} className="text-[var(--text-muted)]" />
              </a>
              <a href="/alerts" className="flex items-center justify-between rounded-lg border border-[var(--border)] px-3 py-2 hover:border-teal-300 hover:bg-[var(--bg-surface-hover)]">
                <span>Review Alerts & Incidents</span><ArrowRight size={14} className="text-[var(--text-muted)]" />
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
