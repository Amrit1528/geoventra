/**
 * GEOVENTRA — engine health score.
 *
 * The score is a weighted blend of four components. It is deterministic and explainable: the
 * breakdown is surfaced to the UI so a fleet manager can see *why* a vehicle is unhealthy.
 */

import type { DtcSeverity, EngineAlertSeverity, EngineHealthStatus } from '@geoventra/contracts';
import { ENGINE_HEALTH_RULES, breachesThreshold, latestReadingFor } from './engine-health.rules.js';

export interface HealthScoreComponent {
  key: string;
  label: string;
  /** Points earned, 0 … weight. */
  score: number;
  /** Maximum points this component can contribute. */
  weight: number;
  detail: string;
}

export interface HealthScoreResult {
  score: number;
  status: EngineHealthStatus;
  breakdown: HealthScoreComponent[];
}

export interface HealthScoreInput {
  activeDtcs: Array<{ severity: DtcSeverity; milOn: boolean }>;
  openAlerts: Array<{ severity: EngineAlertSeverity }>;
  readings: Array<{ metric: string; value: number; unit: string; recordedAt: string }>;
}

const DTC_WEIGHT = 40;
const ALERT_WEIGHT = 25;
const METRIC_WEIGHT = 25;
const MIL_WEIGHT = 10;

const DTC_PENALTY: Record<DtcSeverity, number> = { critical: 35, warning: 15, info: 5 };
const ALERT_PENALTY: Record<EngineAlertSeverity, number> = { critical: 25, warning: 10, info: 3 };

/**
 * Compute the engine health score for a vehicle.
 *
 * A score of 80 or above is `healthy`, 50–79 is `degraded` and anything below is `critical`.
 */
export function computeEngineHealthScore(input: HealthScoreInput): HealthScoreResult {
  const breakdown: HealthScoreComponent[] = [];

  // ── DTCs ────────────────────────────────────────────────────────────────
  const dtcPenalty = input.activeDtcs.reduce(
    (total, dtc) => total + (DTC_PENALTY[dtc.severity] ?? 0),
    0,
  );
  const dtcScore = Math.max(0, DTC_WEIGHT - dtcPenalty);
  breakdown.push({
    key: 'dtcs',
    label: 'Diagnostic trouble codes',
    score: dtcScore,
    weight: DTC_WEIGHT,
    detail:
      input.activeDtcs.length === 0
        ? 'No active trouble codes'
        : `${input.activeDtcs.length} active trouble code${input.activeDtcs.length > 1 ? 's' : ''}`,
  });

  // ── Health alerts ───────────────────────────────────────────────────────
  const alertPenalty = input.openAlerts.reduce(
    (total, alert) => total + (ALERT_PENALTY[alert.severity] ?? 0),
    0,
  );
  const alertScore = Math.max(0, ALERT_WEIGHT - alertPenalty);
  breakdown.push({
    key: 'alerts',
    label: 'Health alerts',
    score: alertScore,
    weight: ALERT_WEIGHT,
    detail:
      input.openAlerts.length === 0
        ? 'No open health alerts'
        : `${input.openAlerts.length} open alert${input.openAlerts.length > 1 ? 's' : ''}`,
  });

  // ── Live metrics ────────────────────────────────────────────────────────
  const breachedRules = ENGINE_HEALTH_RULES.filter((rule) => {
    if (!rule.metric) return false;
    const reading = latestReadingFor(
      input.readings.map((reading) => ({ ...reading, id: '', vehicleId: '', deviceId: null, pid: null, sourceClassification: 'device', dataQuality: 'good', receivedAt: reading.recordedAt, protocolMetadata: {} })),
      rule.metric,
    );
    if (!reading) return false;
    return breachesThreshold(reading.value, rule.threshold, rule.comparator);
  });
  const metricPenalty = breachedRules.length * 12;
  const metricScore = Math.max(0, METRIC_WEIGHT - metricPenalty);
  breakdown.push({
    key: 'metrics',
    label: 'Live sensor metrics',
    score: metricScore,
    weight: METRIC_WEIGHT,
    detail:
      breachedRules.length === 0
        ? 'All monitored metrics within limits'
        : `${breachedRules.length} metric${breachedRules.length > 1 ? 's' : ''} out of range`,
  });

  // ── MIL ─────────────────────────────────────────────────────────────────
  const milOn = input.activeDtcs.some((dtc) => dtc.milOn);
  const milScore = milOn ? 0 : MIL_WEIGHT;
  breakdown.push({
    key: 'mil',
    label: 'Malfunction indicator lamp',
    score: milScore,
    weight: MIL_WEIGHT,
    detail: milOn ? 'Check engine light is illuminated' : 'Check engine light is off',
  });

  const score = Math.max(0, Math.min(100, breakdown.reduce((total, part) => total + part.score, 0)));

  return {
    score,
    status: score >= 80 ? 'healthy' : score >= 50 ? 'degraded' : 'critical',
    breakdown,
  };
}
