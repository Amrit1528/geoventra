/**
 * Unit tests for the built-in engine health rules.
 */

import { describe, expect, it } from 'vitest';
import type { EngineTelemetryReading } from '@geoventra/contracts';
import {
  ENGINE_HEALTH_RULES,
  breachesThreshold,
  evaluateEngineRules,
  latestReadingFor,
  ruleDefinition,
  type RecoveryPolicy,
} from './engine-health.rules.js';

function reading(metric: string, value: number, recordedAt = '2026-11-12T00:00:00.000Z'): EngineTelemetryReading {
  return {
    id: `id-${metric}`,
    vehicleId: 'vehicle',
    deviceId: null,
    metric,
    pid: null,
    value,
    unit: '°C',
    sourceClassification: 'device',
    dataQuality: 'good',
    recordedAt,
    receivedAt: recordedAt,
    protocolMetadata: {},
  };
}

const noPolicies = new Map<string, RecoveryPolicy>();
const noCounts = new Map<string, number>();

describe('latestReadingFor', () => {
  it('returns the newest reading for a metric', () => {
    const readings = [
      reading('coolant_temp_c', 80, '2026-11-12T00:00:00.000Z'),
      reading('coolant_temp_c', 95, '2026-11-12T01:00:00.000Z'),
      reading('engine_rpm', 2100, '2026-11-12T01:30:00.000Z'),
    ];
    expect(latestReadingFor(readings, 'coolant_temp_c')?.value).toBe(95);
    expect(latestReadingFor(readings, 'battery_voltage_v')).toBeNull();
  });
});

describe('breachesThreshold', () => {
  it('compares with gt/lt semantics', () => {
    expect(breachesThreshold(110, 105, 'gt')).toBe(true);
    expect(breachesThreshold(100, 105, 'gt')).toBe(false);
    expect(breachesThreshold(11.2, 11.5, 'lt')).toBe(true);
    expect(breachesThreshold(12.4, 11.5, 'lt')).toBe(false);
  });
});

describe('evaluateEngineRules', () => {
  it('flags an overheating coolant temperature as critical', () => {
    const evaluations = evaluateEngineRules({
      readings: [reading('coolant_temp_c', 110)],
      activeMilCodes: [],
      recoveryCounts: noCounts,
      recoveryPolicies: noPolicies,
    });

    const overheating = evaluations.find((value) => value.ruleId === 'engine_overheating');
    expect(overheating?.breached).toBe(true);
    expect(overheating?.severity).toBe('critical');
    expect(overheating?.recovered).toBe(false);
    expect(overheating?.recoveryCount).toBe(0);
  });

  it('flags a healthy coolant temperature as not breached and increments the recovery counter', () => {
    const evaluations = evaluateEngineRules({
      readings: [reading('coolant_temp_c', 88)],
      activeMilCodes: [],
      recoveryCounts: new Map([['engine_overheating', 2]]),
      recoveryPolicies: noPolicies,
    });

    const overheating = evaluations.find((value) => value.ruleId === 'engine_overheating');
    expect(overheating?.breached).toBe(false);
    expect(overheating?.recovered).toBe(true); // threshold is 3 by default
    expect(overheating?.recoveryCount).toBe(3);
  });

  it('does not report recovery before enough healthy samples accumulate', () => {
    const evaluations = evaluateEngineRules({
      readings: [reading('coolant_temp_c', 88)],
      activeMilCodes: [],
      recoveryCounts: new Map([['engine_overheating', 1]]),
      recoveryPolicies: noPolicies,
    });

    const overheating = evaluations.find((value) => value.ruleId === 'engine_overheating');
    expect(overheating?.recovered).toBe(false);
    expect(overheating?.recoveryCount).toBe(2);
  });

  it('honours organisation-level recovery policy overrides', () => {
    const policies = new Map<string, RecoveryPolicy>([
      ['engine_overheating', { recoveryValue: 100, recoveryCount: 1, enabled: true }],
    ]);

    const evaluations = evaluateEngineRules({
      readings: [reading('coolant_temp_c', 88)],
      activeMilCodes: [],
      recoveryCounts: new Map(),
      recoveryPolicies: policies,
    });

    const overheating = evaluations.find((value) => value.ruleId === 'engine_overheating');
    expect(overheating?.recovered).toBe(true);
    expect(overheating?.recoveryThreshold).toBe(1);
  });

  it('flags the MIL when an MIL-active DTC is present', () => {
    const evaluations = evaluateEngineRules({
      readings: [],
      activeMilCodes: ['P0300'],
      recoveryCounts: new Map([['mil_active', 1]]),
      recoveryPolicies: noPolicies,
    });

    const mil = evaluations.find((value) => value.ruleId === 'mil_active');
    expect(mil?.breached).toBe(true);
    expect(mil?.observedUnit).toBe('codes');
    expect(mil?.recoveryCount).toBe(0);
  });

  it('flags low battery voltage', () => {
    const evaluations = evaluateEngineRules({
      readings: [reading('battery_voltage_v', 11.2)],
      activeMilCodes: [],
      recoveryCounts: noCounts,
      recoveryPolicies: noPolicies,
    });

    const voltage = evaluations.find((value) => value.ruleId === 'low_voltage');
    expect(voltage?.breached).toBe(true);
    expect(voltage?.severity).toBe('warning');
  });

  it('emits one evaluation per built-in rule', () => {
    const evaluations = evaluateEngineRules({
      readings: [],
      activeMilCodes: [],
      recoveryCounts: noCounts,
      recoveryPolicies: noPolicies,
    });

    expect(evaluations).toHaveLength(ENGINE_HEALTH_RULES.length);
  });
});

describe('ruleDefinition', () => {
  it('returns the built-in rule definition for a known rule id', () => {
    expect(ruleDefinition('engine_overheating')?.threshold).toBe(105);
    expect(ruleDefinition('no_such_rule')).toBeNull();
  });
});
