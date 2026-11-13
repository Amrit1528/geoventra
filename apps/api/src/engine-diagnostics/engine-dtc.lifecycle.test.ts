/**
 * Unit tests for the DTC lifecycle state machine.
 */

import { describe, expect, it } from 'vitest';
import type { EngineDtc } from '@geoventra/contracts';
import {
  InvalidDtcTransitionError,
  isLiveDtc,
  transitionDtc,
} from './engine-dtc.lifecycle.js';

function makeDtc(overrides: Partial<EngineDtc> = {}): EngineDtc {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    vehicleId: '22222222-2222-4222-8222-222222222222',
    code: 'P0300',
    category: 'P',
    description: 'Random/multiple cylinder misfire detected',
    severity: 'warning',
    status: 'active',
    milOn: true,
    firstDetectedAt: '2026-11-12T00:00:00.000Z',
    lastDetectedAt: '2026-11-12T00:00:00.000Z',
    occurrenceCount: 1,
    freezeFrame: null,
    acknowledged: false,
    acknowledgedAt: null,
    acknowledgedBy: null,
    resolved: false,
    resolvedAt: null,
    resolvedBy: null,
    createdAt: '2026-11-12T00:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
    ...overrides,
  };
}

describe('transitionDtc — detect', () => {
  it('creates an active DTC for an unknown code', () => {
    const transition = transitionDtc({
      current: null,
      action: 'detect',
      severity: 'critical',
      milOn: true,
    });

    expect(transition.status).toBe('active');
    expect(transition.eventType).toBe('detected');
    expect(transition.occurrenceCount).toBe(1);
    expect(transition.milOn).toBe(true);
    expect(transition.captureFreezeFrame).toBe(true);
    expect(transition.acknowledged).toBe(false);
    expect(transition.resolved).toBe(false);
  });

  it('updates occurrence count for a known, live DTC', () => {
    const transition = transitionDtc({
      current: makeDtc({ occurrenceCount: 3, status: 'active' }),
      action: 'detect',
      severity: 'critical',
      milOn: true,
    });

    expect(transition.status).toBe('active');
    expect(transition.eventType).toBe('updated');
    expect(transition.occurrenceCount).toBe(4);
    expect(transition.captureFreezeFrame).toBe(false);
  });

  it('reactivates a previously cleared DTC and resets acknowledgement', () => {
    const cleared = makeDtc({
      status: 'cleared',
      resolved: true,
      acknowledged: true,
      milOn: false,
      occurrenceCount: 2,
    });

    const transition = transitionDtc({
      current: cleared,
      action: 'detect',
      severity: 'critical',
      milOn: true,
    });

    expect(transition.status).toBe('active');
    expect(transition.eventType).toBe('reoccurred');
    expect(transition.occurrenceCount).toBe(3);
    expect(transition.acknowledged).toBe(false);
    expect(transition.resolved).toBe(false);
    expect(transition.milOn).toBe(true);
    expect(transition.captureFreezeFrame).toBe(true);
  });

  it('promotes a pending DTC to active', () => {
    const transition = transitionDtc({
      current: makeDtc({ status: 'pending' }),
      action: 'detect',
      severity: 'info',
      milOn: false,
    });

    expect(transition.status).toBe('active');
    expect(transition.eventType).toBe('updated');
  });
});

describe('transitionDtc — acknowledge', () => {
  it('acknowledges an active DTC', () => {
    const transition = transitionDtc({
      current: makeDtc({ status: 'active' }),
      action: 'acknowledge',
      severity: 'warning',
      milOn: true,
    });

    expect(transition.status).toBe('acknowledged');
    expect(transition.acknowledged).toBe(true);
    expect(transition.eventType).toBe('acknowledged');
  });

  it('refuses to acknowledge an unknown DTC', () => {
    expect(() =>
      transitionDtc({
        current: null,
        action: 'acknowledge',
        severity: 'warning',
        milOn: false,
      }),
    ).toThrow(InvalidDtcTransitionError);
  });

  it('refuses to acknowledge a cleared DTC', () => {
    expect(() =>
      transitionDtc({
        current: makeDtc({ status: 'cleared', resolved: true }),
        action: 'acknowledge',
        severity: 'warning',
        milOn: false,
      }),
    ).toThrow(InvalidDtcTransitionError);
  });
});

describe('transitionDtc — resolve', () => {
  it('resolves an acknowledged DTC and clears the MIL', () => {
    const transition = transitionDtc({
      current: makeDtc({ status: 'acknowledged', acknowledged: true }),
      action: 'resolve',
      severity: 'warning',
      milOn: true,
    });

    expect(transition.status).toBe('cleared');
    expect(transition.resolved).toBe(true);
    expect(transition.milOn).toBe(false);
    expect(transition.eventType).toBe('resolved');
    expect(transition.captureFreezeFrame).toBe(true);
  });

  it('resolves directly from active without acknowledgement', () => {
    const transition = transitionDtc({
      current: makeDtc({ status: 'active' }),
      action: 'resolve',
      severity: 'warning',
      milOn: true,
    });

    expect(transition.status).toBe('cleared');
    expect(transition.acknowledged).toBe(false);
  });

  it('refuses to resolve an already cleared DTC', () => {
    expect(() =>
      transitionDtc({
        current: makeDtc({ status: 'cleared', resolved: true }),
        action: 'resolve',
        severity: 'warning',
        milOn: false,
      }),
    ).toThrow(InvalidDtcTransitionError);
  });
});

describe('transitionDtc — clear', () => {
  it('clears a live DTC, recording the cleared event', () => {
    const transition = transitionDtc({
      current: makeDtc({ status: 'active' }),
      action: 'clear',
      severity: 'warning',
      milOn: true,
    });

    expect(transition.status).toBe('cleared');
    expect(transition.eventType).toBe('cleared');
    expect(transition.milOn).toBe(false);
    expect(transition.captureFreezeFrame).toBe(true);
  });

  it('is a no-op for an already cleared DTC', () => {
    const transition = transitionDtc({
      current: makeDtc({ status: 'cleared', resolved: true, occurrenceCount: 4 }),
      action: 'clear',
      severity: 'warning',
      milOn: false,
    });

    expect(transition.status).toBe('cleared');
    expect(transition.occurrenceCount).toBe(4);
    expect(transition.captureFreezeFrame).toBe(false);
  });
});

describe('isLiveDtc', () => {
  it('treats active and acknowledged DTCs as live', () => {
    expect(isLiveDtc({ status: 'active', resolved: false })).toBe(true);
    expect(isLiveDtc({ status: 'acknowledged', resolved: false })).toBe(true);
  });

  it('treats cleared and resolved DTCs as not live', () => {
    expect(isLiveDtc({ status: 'cleared', resolved: true })).toBe(false);
    expect(isLiveDtc({ status: 'historical', resolved: true })).toBe(false);
    expect(isLiveDtc({ status: 'active', resolved: true })).toBe(false);
  });
});
