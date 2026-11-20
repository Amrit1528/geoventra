'use client';
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Brain } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, KpiCard, LoadingPanel, PageLayout } from '@geoventra/ui';
import {
  askIntelligenceAssistant,
  fetchIntelligenceAnomalies,
  fetchIntelligenceDrivers,
  fetchIntelligenceFleet,
  fetchIntelligenceForecast,
  fetchIntelligenceFuel,
  fetchIntelligenceMaintenance,
  fetchIntelligenceOverview,
  fetchIntelligenceRecommendations,
} from '@/lib/intelligence-api';

export default function IntelligencePage() {
  const [question, setQuestion] = useState('');
  const overviewQ = useQuery({ queryKey: ['intel-overview'], queryFn: () => fetchIntelligenceOverview() });
  const fleetQ = useQuery({ queryKey: ['intel-fleet'], queryFn: () => fetchIntelligenceFleet() });
  const fuelQ = useQuery({ queryKey: ['intel-fuel'], queryFn: () => fetchIntelligenceFuel() });
  const driversQ = useQuery({ queryKey: ['intel-drivers'], queryFn: () => fetchIntelligenceDrivers() });
  const maintQ = useQuery({ queryKey: ['intel-maint'], queryFn: () => fetchIntelligenceMaintenance() });
  const anomQ = useQuery({ queryKey: ['intel-anom'], queryFn: () => fetchIntelligenceAnomalies() });
  const recsQ = useQuery({ queryKey: ['intel-recs'], queryFn: () => fetchIntelligenceRecommendations() });
  const forecastQ = useQuery({ queryKey: ['intel-forecast'], queryFn: () => fetchIntelligenceForecast() });

  const askMut = useMutation({ mutationFn: (q: string) => askIntelligenceAssistant(q) });

  const overview = overviewQ.data;
  const fleet = fleetQ.data;
  const fuel = fuelQ.data;

  return (
    <PageLayout title="AI Intelligence" description="Fleet health, fuel, driver safety, maintenance predictions and anomaly detection." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Vehicle Intelligence' }, { label: 'AI Intelligence' }]}>
      {overviewQ.isLoading ? <LoadingPanel label="Loading intelligence…" /> : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard icon={<Brain size={18} />} label="Fleet utilization" value={String(fleet?.utilizationPercent ?? '—')} unit="%" />
            <KpiCard icon={<Brain size={18} />} label="Availability" value={String(fleet?.availabilityPercent ?? '—')} unit="%" />
            <KpiCard icon={<Brain size={18} />} label="Productivity score" value={String(fleet?.productivityScore ?? '—')} unit="/100" />
            <KpiCard icon={<Brain size={18} />} label="Mileage" value={String(fuel?.mileageKmPerL ?? '—')} unit="km/l" />
            <KpiCard icon={<Brain size={18} />} label="Anomalies" value={String(overview?.anomaliesCount ?? '—')} unit="open" />
            <KpiCard icon={<Brain size={18} />} label="Recommendations" value={String(overview?.recommendationsCount ?? '—')} unit="items" />
            <KpiCard icon={<Brain size={18} />} label="Maintenance predictions" value={String(overview?.maintenancePredictionsCount ?? '—')} unit="active" />
            <KpiCard icon={<Brain size={18} />} label="Forecast next month fuel" value={String(forecastQ.data?.forecastNextMonthLitres ?? '—')} unit="litres" />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Fleet status</CardTitle></CardHeader>
              <CardContent>
                {fleet ? (
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Total vehicles: <b>{fleet.totalVehicles}</b></div>
                    <div>Active: <b>{fleet.activeVehicles}</b></div>
                    <div>Moving: <b>{fleet.moving}</b></div>
                    <div>Idle: <b>{fleet.idle}</b></div>
                    <div>Stopped: <b>{fleet.stopped}</b></div>
                    <div>Offline: <b>{fleet.offline}</b></div>
                    <div>Under maintenance: <b>{fleet.underMaintenance}</b></div>
                    <div>Avg daily distance: <b>{fleet.averageDailyDistanceKm} km</b></div>
                  </div>
                ) : <LoadingPanel label="Loading…" />}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>AI Fleet Assistant</CardTitle></CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about fleet, fuel, drivers…" className="h-9 flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-sm" />
                  <Button size="sm" onClick={() => { if (question.trim()) askMut.mutate(question.trim()); }}>Ask</Button>
                </div>
                {askMut.isPending && <LoadingPanel label="Thinking…" />}
                {askMut.data && (
                  <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-sm">
                    <div className="font-medium">{askMut.data.answer}</div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Driver safety ranking</CardTitle></CardHeader>
              <CardContent>
                {driversQ.isLoading ? <LoadingPanel label="Loading…" /> : (
                  <div className="space-y-2">
                    {(driversQ.data?.data ?? []).slice(0, 8).map((d: any) => (
                      <div key={d.id} className="flex items-center justify-between rounded-lg border border-[var(--border)] p-2 text-sm">
                        <div>{d.name}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant={d.riskLevel === 'high' ? 'critical' : d.riskLevel === 'medium' ? 'warning' : 'success'}>{d.riskLevel}</Badge>
                          <span className="font-medium">{d.driverScore}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Maintenance predictions</CardTitle></CardHeader>
              <CardContent>
                {maintQ.isLoading ? <LoadingPanel label="Loading…" /> : (
                  <div className="space-y-2">
                    {(maintQ.data?.predictions ?? []).slice(0, 8).map((p: any) => (
                      <div key={p.id} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{p.vehicleRegistration}</span>
                          <Badge variant={p.riskLevel === 'critical' || p.riskLevel === 'high' ? 'critical' : 'warning'}>{p.riskLevel}</Badge>
                        </div>
                        <div className="text-xs text-[var(--text-muted)]">{p.issueTitle}</div>
                      </div>
                    ))}
                    {(!maintQ.data?.predictions || maintQ.data.predictions.length === 0) && <div className="text-sm text-[var(--text-muted)]">No active predictions.</div>}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader><CardTitle>Anomalies</CardTitle></CardHeader>
            <CardContent>
              {anomQ.isLoading ? <LoadingPanel label="Loading…" /> : (
                <div className="space-y-2">
                  {(anomQ.data?.data ?? []).slice(0, 10).map((a: any, i: number) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{a.title}</span>
                        <Badge variant={a.severity === 'critical' || a.severity === 'high' ? 'critical' : 'warning'}>{a.severity}</Badge>
                      </div>
                      <div className="text-xs text-[var(--text-muted)]">{a.vehicleRegistration} · {a.description}</div>
                    </div>
                  ))}
                  {(!anomQ.data?.data || anomQ.data.data.length === 0) && <div className="text-sm text-[var(--text-muted)]">No anomalies detected.</div>}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Recommendations</CardTitle></CardHeader>
            <CardContent>
              {recsQ.isLoading ? <LoadingPanel label="Loading…" /> : (
                <div className="space-y-2">
                  {(recsQ.data?.data ?? []).slice(0, 10).map((r: any, i: number) => (
                    <div key={i} className="rounded-lg border border-[var(--border)] p-2 text-sm">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-[var(--text-muted)]">{r.evidence} → {r.action}</div>
                    </div>
                  ))}
                  {(!recsQ.data?.data || recsQ.data.data.length === 0) && <div className="text-sm text-[var(--text-muted)]">No recommendations.</div>}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageLayout>
  );
}
