'use client';
import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Award, Gauge } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';

export default function ScorecardsPage(): ReactElement {
  const q = useQuery({ queryKey: ['scorecard-results'], queryFn: () => apiRequest<any>('/scorecards/results') });
  const rows = q.data?.data ?? [];
  const avgScore = rows.length ? rows.reduce((sum: number, r: any) => sum + Number(r.overall_score ?? 0), 0) / rows.length : 0;
  const topScore = rows.length ? Math.max(...rows.map((r: any) => Number(r.overall_score ?? 0))) : 0;

  return (
    <PageLayout title="Driver & vehicle scorecards" description="Scores calculated from real trip, driving and telemetry records.">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Award size={18} />} label="Scorecards" value={String(rows.length)} unit="computed" />
        <KpiCard icon={<Gauge size={18} />} label="Average score" value={avgScore.toFixed(1)} unit="out of 100" tone="positive" />
        <KpiCard icon={<Award size={18} />} label="Top score" value={topScore.toFixed(1)} unit="best performer" />
        <KpiCard icon={<Gauge size={18} />} label="Entities" value={String(new Set(rows.map((r: any) => r.entity_id)).size)} unit="tracked" />
      </div>

      <Card>
        <CardHeader><CardTitle as="h2">Results</CardTitle></CardHeader>
        <CardContent>
          {q.isLoading && <LoadingPanel label="Loading scorecards…" />}
          {q.isError && <EmptyState title="Failed to load" />}
          {rows.length === 0 && !q.isLoading ? <EmptyState title="No scorecard results yet" description="Scorecards are generated from trip and telemetry data." icon={<Award size={24} />} /> : null}
          <div className="space-y-3">
            {rows.map((r: any) => {
              const score = Number(r.overall_score ?? 0);
              return (
                <div key={r.id} className="rounded-lg border border-[var(--border)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-[var(--text-primary)]">{r.entity_type} · {String(r.entity_id).slice(0, 8)}</div>
                      <div className="text-xs text-[var(--text-muted)]">{r.period_start} → {r.period_end}</div>
                    </div>
                    <Badge variant={score >= 80 ? 'success' : score >= 60 ? 'warning' : 'critical'}>{score.toFixed(1)}</Badge>
                  </div>
                  <div className="mt-2 h-2 w-full rounded-full bg-[var(--bg-app)]">
                    <div className="h-2 rounded-full bg-teal-500" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
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