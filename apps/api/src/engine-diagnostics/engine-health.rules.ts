/**
 * GEOVENTRA — engine health rules.
 *
 * The rules are deliberately pure: they take readings plus the persisted recovery state and
 * return a verdict. The service layer is responsible for persisting alerts, incrementing the
 * recovery counters and emitting realtime events — keeping this module free of I/O makes the
 * alerting behaviour straightforward to unit test.
 */

import type { EngineAlertSeverity, EngineTelemetryReading } from '@geoventra/contracts';

export type RuleComparator = 'gt' | 'lt';

export interface EngineRuleDefinition {
  ruleId: string;
  severity: EngineAlertSeverity;
  title: string;
  description: string;
  /** Metric watched by the rule; `null` for rules driven by DTC state. */
  metric: string | null;
  unit: string;
  threshold: number;
  comparator: RuleComparator;
  /** Consecutive healthy samples required before an alert auto-resolves. */
  defaultRecoveryCount: number;
}

/**
 * The built-in rule set. `engine_overheating`, `high_rpm`, `low_voltage` and `mil_active`
 * match the rules seeded into `engine_health_alerts`.
 */
export const ENGINE_HEALTH_RULES: readonly EngineRuleDefinition[] = [
  {
    ruleId: 'engine_overheating',
    severity: 'critical',
    title: 'Engine overheating',
    description: 'Coolant temperature exceeded the safe operating range',
    metric: 'coolant_temp_c',
    unit: '°C',
    threshold: 105,
    comparator: 'gt',
    defaultRecoveryCount: 3,
  },
  {
    ruleId: 'high_rpm',
    severity: 'warning',
    title: 'High engine RPM',
    description: 'Engine speed exceeded the configured limit',
    metric: 'engine_rpm',
    unit: 'rpm',
    threshold: 6000,
    comparator: 'gt',
    defaultRecoveryCount: 3,
  },
  {
    ruleId: 'low_voltage',
    severity: 'warning',
    title: 'Low battery voltage',
    description: 'Battery voltage dropped below the cranking threshold',
    metric: 'battery_voltage_v',
    unit: 'V',
    threshold: 11.5,
    comparator: 'lt',
    defaultRecoveryCount: 2,
  },
  {
    ruleId: 'mil_active',
    severity: 'warning',
    title: 'Check engine light active',
    description: 'One or more active DTCs have the malfunction indicator lamp on',
    metric: null,
    unit: '',
    threshold: 0,
    comparator: 'gt',
    defaultRecoveryCount: 1,
  },
];

export interface RecoveryPolicy {
  recoveryValue: number;
  recoveryCount: number;
  enabled: boolean;
}

export interface RuleEvaluationInput {
  /** Latest readings for the vehicle, newest last. */
  readings: EngineTelemetryReading[];
  /** Codes of the currently active DTCs that have the MIL illuminated. */
  activeMilCodes: string[];
  /** Persisted recovery counters keyed by rule id. */
  recoveryCounts: ReadonlyMap<string, number>;
  /** Optional per-organisation recovery policy overrides keyed by rule id. */
  recoveryPolicies: ReadonlyMap<string, RecoveryPolicy>;
}

export interface RuleEvaluation {
  ruleId: string;
  severity: EngineAlertSeverity;
  title: string;
  description: string;
  metric: string | null;
  observedValue: number | null;
  observedUnit: string | null;
  thresholdValue: number | null;
  /** True when the rule condition is currently satisfied. */
  breached: boolean;
  /** True when the rule is healthy again and the recovery threshold has been reached. */
  recovered: boolean;
  /** Consecutive healthy samples observed since the last breach. */
  recoveryCount: number;
  /** Number of healthy samples required before the alert may auto-resolve. */
  recoveryThreshold: number;
}

/** The newest reading for a metric, or `null` when the metric has never been reported. */
export function latestReadingFor(
  readings: EngineTelemetryReading[],
  metric: string,
): EngineTelemetryReading | null {
  let latest: EngineTelemetryReading | null = null;
  for (const reading of readings) {
    if (reading.metric !== metric) continue;
    if (!latest || new Date(reading.recordedAt).getTime() >= new Date(latest.recordedAt).getTime()) {
      latest = reading;
    }
  }
  return latest;
}

/** True when `value` breaches the rule's threshold. */
export function breachesThreshold(
  value: number,
  threshold: number,
  comparator: RuleComparator,
): boolean {
  return comparator === 'gt' ? value > threshold : value < threshold;
}

/**
 * Evaluate every built-in rule against the supplied readings.
 *
 * Recovery counters advance only while the rule is healthy. A rule that is healthy but has
 * not yet accumulated enough healthy samples is reported as `breached: false, recovered: false`
 * so the caller keeps the alert open.
 */
export function evaluateEngineRules(input: RuleEvaluationInput): RuleEvaluation[] {
  const evaluations: RuleEvaluation[] = [];

  for (const rule of ENGINE_HEALTH_RULES) {
    const policy = input.recoveryPolicies.get(rule.ruleId);
    const recoveryThreshold = policy?.recoveryCount ?? rule.defaultRecoveryCount;
    const previousCount = input.recoveryCounts.get(rule.ruleId) ?? 0;

    let observedValue: number | null = null;
    let observedUnit: string | null = null;
    let breached = false;

    if (rule.metric === null) {
      // State-driven rule (the malfunction indicator lamp).
      breached = input.activeMilCodes.length > 0;
      observedValue = breached ? input.activeMilCodes.length : 0;
      observedUnit = 'codes';
    } else {
      const reading = latestReadingFor(input.readings, rule.metric);
      if (reading) {
        observedValue = reading.value;
        observedUnit = reading.unit;
        breached = breachesThreshold(reading.value, rule.threshold, rule.comparator);
      }
    }

    const recoveryCount = breached ? 0 : previousCount + 1;
    const recovered = !breached && recoveryCount >= recoveryThreshold;

    evaluations.push({
      ruleId: rule.ruleId,
      severity: rule.severity,
      title: rule.title,
      description: rule.description,
      metric: rule.metric,
      observedValue,
      observedUnit,
      thresholdValue: rule.metric === null ? null : rule.threshold,
      breached,
      recovered,
      recoveryCount,
      recoveryThreshold,
    });
  }

  return evaluations;
}

/** The rule definition for a rule id, or `null` when the rule is unknown. */
export function ruleDefinition(ruleId: string): EngineRuleDefinition | null {
  return ENGINE_HEALTH_RULES.find((rule) => rule.ruleId === ruleId) ?? null;
}
