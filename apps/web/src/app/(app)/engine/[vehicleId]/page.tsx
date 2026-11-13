/**
 * GEOVENTRA — vehicle engine diagnostics page (Phase 5.1).
 *
 * Presents, for a single vehicle:
 *   1. realtime telemetry (socket-fed tiles with an LIVE indicator);
 *   2. DTC lifecycle management (acknowledge / resolve, freeze-frame viewer);
 *   3. historical diagnostics (time-range selector + health charts);
 *   4. the diagnostic event timeline (DTC events, health alerts, telemetry markers);
 *   5. engine health score with the deterministic component breakdown.
 */

'use client';

import { useEffect, useMemo, useState, type ReactElement } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Gauge } from 'lucide-react';
import {
  Badge,
  badgeVariantForSeverity,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Header,
  PageLayout,
  LoadingPanel,
  EmptyState,
} from '@geoventra/ui';
import type {
  EngineDtc,
  EngineTelemetryReading,
  EngineTimelineEntry,
  EngineTimelineKind,
} from '@geoventra/contracts';
import {
  acknowledgeDtc,
  fetchEngineCharts,
  fetchEngineOverview,
  fetchEngineTimeline,
  fetchLatestTelemetry,
  fetchVehicleDtcs,
  resolveDtc,
} from '@/lib/engine-api';
import {
  connectEngineSocket,
  onEngineEvent,
  onEngineSocketStatus,
  subscribeToVehicle,
  unsubscribeFromVehicle,
  type EngineSocketStatus,
} from '@/lib/engine-socket';
import { MetricTile } from '@/components/engine/MetricTile';
import { LineChart } from '@/components/engine/LineChart';
import { DtcTable } from '@/components/engine/DtcTable';
import { FreezeFrameModal } from '@/components/engine/FreezeFrameModal';
import { TimelineList } from '@/components/engine/TimelineList';
import { HealthBreakdown } from '@/components/engine/HealthBreakdown';
import { HealthRing } from '@/components/engine/HealthRing';
import { metricLabel, formatRelativeTime, metricUnit } from '@/lib/format';

type RangeKey = '1h' | '6h' | '24h' | '7d';

const RANGE_SUMMARY: Record<RangeKey, { label: string; ms: number; bucket: 'minute' | 'hour' | 'day' }> = {
  '1h': { label: 'Last hour', ms: 60 * 60 * 1000, bucket: 'minute' },
  '6h': { label: 'Last 6 hours', ms: 6 * 60 * 60 * 1000, bucket: 'minute' },
  '24h': { label: 'Last 24 hours', ms: 24 * 60 * 60 * 1000, bucket: 'hour' },
  '7d': { label: 'Last 7 days', ms: 7 * 24 * 60 * 60 * 1000, bucket: 'day' },
};

const CHART_COLORS = ['var(--primary-500)', 'var(--amber-500)', 'var(--green-500)', 'var(--accent-500)', 'var(--red-500)'];

export default function VehicleDiagnosticsPage(): ReactElement {
  const params = useParams<{ vehicleId: string }>();
  const vehicleId = params.vehicleId;
  const queryClient = useQueryClient();

  const [range, setRange] = useState<RangeKey>('24h');
  const [dtcKindFilter, setDtcKindFilter] = useState<'all' | EngineTimelineKind>('all');
  const [socketStatus, setSocketStatus] = useState<EngineSocketStatus>('idle');
  const [liveReadings, setLiveReadings] = useState<Map<string, EngineTelemetryReading>>(new Map());
  const [freezeFrameFor, setFreezeFrameFor] = useState<EngineDtc | null>(null);
  const [pendingDtcId, setPendingDtcId] = useState<string | null>(null);
  const [dtcStatusFilter, setDtcStatusFilter] = useState<'all' | 'active' | 'acknowledged' | 'cleared'>('all');

  const chartsFrom = useMemo(() => new Date(Date.now() - RANGE_SUMMARY[range].ms).toISOString(), [range]);

  // ── Data ───────────────────────────────────────────────────────────────────
  const overviewQuery = useQuery({
    queryKey: ['engine-overview', vehicleId],
    queryFn: ({ signal }) => fetchEngineOverview(vehicleId, signal),
    enabled: Boolean(vehicleId),
  });

  const latestQuery = useQuery({
    queryKey: ['engine-telemetry-latest', vehicleId],
    queryFn: ({ signal }) => fetchLatestTelemetry(vehicleId, signal),
    enabled: Boolean(vehicleId),
    refetchOnWindowFocus: false,
  });

  const chartsQuery = useQuery({
    queryKey: ['engine-charts', vehicleId, range],
    queryFn: ({ signal }) => fetchEngineCharts(vehicleId, { from: chartsFrom, bucket: RANGE_SUMMARY[range].bucket }, signal),
    enabled: Boolean(vehicleId),
  });

  const dtcsQuery = useQuery({
    queryKey: ['engine-dtcs', vehicleId],
    queryFn: ({ signal }) => fetchVehicleDtcs(vehicleId, {}, signal),
    enabled: Boolean(vehicleId),
  });

  const timelineQuery = useQuery({
    queryKey: ['engine-timeline', vehicleId, dtcKindFilter],
    queryFn: ({ signal }) =>
      fetchEngineTimeline(vehicleId, { limit: 60, kind: dtcKindFilter === 'all' ? undefined : dtcKindFilter }, signal),
    enabled: Boolean(vehicleId),
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const acknowledgeMutation = useMutation({
    mutationFn: (dtc: EngineDtc) => acknowledgeDtc(dtc.id),
    onMutate: (dtc) => setPendingDtcId(dtc.id),
    onSettled: () => setPendingDtcId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['engine-dtcs', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['engine-overview', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['engine-timeline', vehicleId] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (dtc: EngineDtc) => resolveDtc(dtc.id),
    onMutate: (dtc) => setPendingDtcId(dtc.id),
    onSettled: () => setPendingDtcId(null),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['engine-dtcs', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['engine-overview', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['engine-timeline', vehicleId] });
    },
  });

  // ── Realtime ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!vehicleId) return undefined;
    connectEngineSocket();
    subscribeToVehicle(vehicleId);

    const offStatus = onEngineSocketStatus(setSocketStatus);
    const offTelemetry = onEngineEvent('engine.telemetry', (payload) => {
      if (payload.vehicleId !== vehicleId) return;
      setLiveReadings((previous) => {
        const next = new Map(previous);
        for (const reading of payload.readings) next.set(reading.metric, reading);
        return next;
      });
      void queryClient.invalidateQueries({ queryKey: ['engine-overview', vehicleId] });
    });
    const offDtc = onEngineEvent('engine.dtc', (payload) => {
      if (payload.vehicleId !== vehicleId) return;
      void queryClient.invalidateQueries({ queryKey: ['engine-dtcs', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['engine-timeline', vehicleId] });
      void queryClient.invalidateQueries({ queryKey: ['engine-overview', vehicleId] });
    });
    const offAlert = onEngineEvent('engine.alert', (payload) => {
      if (payload.vehicleId !== vehicleId) return;
      void queryClient.invalidateQueries({ queryKey: ['engine-overview', vehicleId] });
    });

    return () => {
      offStatus();
      offTelemetry();
      offDtc();
      offAlert();
      unsubscribeFromVehicle(vehicleId);
    };
  }, [vehicleId, queryClient]);

  // ── Derived state ───────────────────────────────────────────────────────────
  const overview = overviewQuery.data;
  const vehicle = overview?.vehicle;
  const health = overview?.health;
  const telemetryMap = useMemo(() => {
    const map = new Map<string, EngineTelemetryReading>();
    for (const reading of latestQuery.data?.data ?? []) map.set(reading.metric, reading);
    for (const [metric, reading] of liveReadings) map.set(metric, reading);
    return map;
  }, [latestQuery.data, liveReadings]);

  const primaryMetrics = ['engine_rpm', 'coolant_temp_c', 'engine_load_pct', 'battery_voltage_v', 'fuel_level_pct', 'vehicle_speed_kph'];
  const allMetrics = Array.from(new Set([...primaryMetrics, ...telemetryMap.keys()]));

  const filteredDtcs = useMemo(() => {
    const rows = dtcsQuery.data?.data ?? [];
    if (dtcStatusFilter === 'all') return rows;
    return rows.filter((dtc) => dtc.status === dtcStatusFilter);
  }, [dtcsQuery.data, dtcStatusFilter]);

  const liveMetric = (metric: string): EngineTelemetryReading | null => telemetryMap.get(metric) ?? null;

  const isLoading = overviewQuery.isLoading;

  if (!vehicleId) return <PageLayout title="Diagnostics"><EmptyState title="Unknown vehicle" /></PageLayout>;

  return (
    <PageLayout
      title={vehicle ? `${vehicle.registrationNumber}` : 'Engine Diagnostics'}
      description={vehicle ? `${vehicle.name} · Engine health, trouble codes and telemetry` : 'Loading vehicle…'}
      actions={
        <Link href="/engine" className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]">
          <ArrowLeft size={14} aria-hidden="true" /> Fleet
        </Link>
      }
    >
      {isLoading || !vehicle || !health ? (
        <LoadingPanel label="Loading engine diagnostics…" />
      ) : (
        <>
          {/* ── Header / health strip ─────────────────────────────────────── */}
          <Card>
            <CardContent className="grid gap-6 py-5 lg:grid-cols-[auto_1fr_auto]">
              <div className="flex items-center gap-5">
                <HealthRing score={health.healthScore} status={health.healthStatus} size={128} />
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={health.healthStatus === 'healthy' ? 'success' : health.healthStatus === 'degraded' ? 'warning' : 'critical'} dot>
                      {health.healthStatus}
                    </Badge>
                    {health.milOn ? <Badge variant="warning">MIL on</Badge> : null}
                    {liveReadings.size > 0 ? <Badge variant="info">Live feed</Badge> : null}
                  </div>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">
                    Health {health.healthScore}/100 · {health.activeDtcCount} active DTC{health.activeDtcCount === 1 ? '' : 's'} ·{' '}
                    {health.openAlertCount} open alert{health.openAlertCount === 1 ? '' : 's'}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    Realtime: {socketStatus === 'live' ? 'connected' : socketStatus} · Last reading{' '}
                    {vehicle.lastReadingAt ? formatRelativeTime(vehicle.lastReadingAt) : 'never'}
                  </p>
                </div>
              </div>

              <div className="border-l border-[var(--border)] pl-6">
                <h2 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                  Score breakdown
                </h2>
                <HealthBreakdown parts={health.scoreBreakdown} />
              </div>

              <div className="flex flex-col justify-center gap-2 border-l border-[var(--border)] pl-6">
                <MetricStat label="Active DTCs" value={String(health.activeDtcCount)} warn={health.activeDtcCount > 0} />
                <MetricStat label="Open alerts" value={String(health.openAlertCount)} warn={health.openAlertCount > 0} />
                <MetricStat label="Realtime" value={socketStatus === 'live' ? 'Connected' : socketStatus} tone={socketStatus === 'live' ? 'ok' : 'muted'} />
              </div>
            </CardContent>
          </Card>

          {/* ── Realtime telemetry ────────────────────────────────────────── */}
          <section aria-label="Realtime telemetry">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-[var(--text-muted)]">Realtime telemetry</h2>
              <span className="text-[11px] text-[var(--text-muted)]">
                {liveReadings.size > 0 ? `${liveReadings.size} metrics streaming` : 'awaiting live frames'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {allMetrics.map((metric) => {
                const reading = liveMetric(metric);
                const unit = reading?.unit ?? metricUnit(metric);
                const inAlert = metric === 'coolant_temp_c' && reading !== null && reading.value > 105;
                return (
                  <MetricTile
                    key={metric}
                    metric={metric}
                    label={metricLabel(metric)}
                    value={reading ? reading.value : null}
                    unit={unit || null}
                    live={liveReadings.has(metric)}
                    alert={inAlert}
                  />
                );
              })}
            </div>
          </section>

          {/* ── Health charts + history ───────────────────────────────────── */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle as="h2">Engine health charts</CardTitle>
              <div className="flex items-center gap-1.5" role="group" aria-label="Time range">
                {(Object.keys(RANGE_SUMMARY) as RangeKey[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setRange(key)}
                    aria-pressed={range === key}
                    className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                      range === key
                        ? 'bg-[var(--primary-600)] text-white'
                        : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                    }`}
                  >
                    {key}
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {chartsQuery.isLoading ? (
                <LoadingPanel label="Loading history…" />
              ) : (chartsQuery.data?.data ?? []).length === 0 ? (
                <EmptyState title="No history" description="No telemetry was recorded for the selected range." />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(chartsQuery.data?.data ?? []).map((chart) => (
                    <Card key={chart.metric} className="border-[var(--border)] bg-[var(--bg-surface)]">
                      <CardHeader className="flex-row items-baseline justify-between py-3">
                        <CardTitle as="h3" className="text-[11px]">{metricLabel(chart.metric)}</CardTitle>
                        <span className="font-mono text-[10px] text-[var(--text-muted)]">
                          min {chart.min?.toFixed(1) ?? '—'} · avg {chart.avg?.toFixed(1) ?? '—'} · max {chart.max?.toFixed(1) ?? '—'}
                        </span>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <LineChart
                          series={[{ name: metricLabel(chart.metric), color: CHART_COLORS[0] ?? 'var(--primary-500)', points: chart.points }]}
                          unit={chart.unit}
                          threshold={chart.threshold}
                          height={150}
                          ariaLabel={`${metricLabel(chart.metric)} over time`}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-6 xl:grid-cols-[3fr_2fr]">
            {/* ── DTC lifecycle ───────────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle as="h2">Trouble codes</CardTitle>
                <div className="flex items-center gap-1.5" role="group" aria-label="Filter by status">
                  {(['all', 'active', 'acknowledged', 'cleared'] as const).map((status) => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => setDtcStatusFilter(status)}
                      aria-pressed={dtcStatusFilter === status}
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition-colors ${
                        dtcStatusFilter === status
                          ? 'bg-[var(--primary-600)] text-white'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {dtcsQuery.isLoading ? (
                  <LoadingPanel label="Loading trouble codes…" />
                ) : (
                  <DtcTable
                    rows={filteredDtcs}
                    pendingId={pendingDtcId}
                    onAcknowledge={(dtc) => acknowledgeMutation.mutate(dtc)}
                    onResolve={(dtc) => resolveMutation.mutate(dtc)}
                    onViewFreezeFrame={setFreezeFrameFor}
                  />
                )}
              </CardContent>
            </Card>

            {/* ── Diagnostic timeline ─────────────────────────────────────── */}
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle as="h2">Diagnostic timeline</CardTitle>
                <div className="flex items-center gap-1.5" role="group" aria-label="Filter by kind">
                  {(['all', 'dtc', 'alert', 'telemetry'] as const).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => setDtcKindFilter(kind)}
                      aria-pressed={dtcKindFilter === kind}
                      className={`rounded-md px-2 py-1 text-[11px] font-semibold capitalize transition-colors ${
                        dtcKindFilter === kind
                          ? 'bg-[var(--primary-600)] text-white'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      {kind}
                    </button>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="max-h-[480px] overflow-y-auto scroll-thin">
                {timelineQuery.isLoading ? (
                  <LoadingPanel label="Loading timeline…" />
                ) : (
                  <TimelineList
                    entries={timelineQuery.data?.data ?? []}
                    activeKind={dtcKindFilter}
                  />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Freeze frame viewer ────────────────────────────────────────── */}
          {freezeFrameFor ? (
            <FreezeFrameModal
              title={`Freeze frame · ${freezeFrameFor.code}`}
              freezeFrame={freezeFrameFor.freezeFrame}
              onClose={() => setFreezeFrameFor(null)}
            />
          ) : null}
        </>
      )}
    </PageLayout>
  );
}

function MetricStat({ label, value, warn = false, tone = 'default' }: { label: string; value: string; warn?: boolean; tone?: 'default' | 'ok' | 'muted' }): ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border)] pb-1.5 last:border-0 last:pb-0">
      <span className="text-[11px] font-semibold text-[var(--text-muted)]">{label}</span>
      <span
        className={`font-mono text-sm font-bold ${
          warn ? 'text-amber-400' : tone === 'ok' ? 'text-emerald-400' : 'text-[var(--text-primary)]'
        }`}
      >
        {value}
      </span>
    </div>
  );
}
