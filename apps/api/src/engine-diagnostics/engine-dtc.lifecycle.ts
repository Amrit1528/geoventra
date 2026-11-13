/**
 * GEOVENTRA — DTC lifecycle state machine.
 *
 * A DTC moves through a small, explicit state machine:
 *
 *                 ┌──────────── reoccur ────────────┐
 *                 │                                  │
 *   (new) ──► active ──► acknowledged ──► cleared ───┘
 *                 │            │
 *                 └────────────┴──► cleared
 *
 * Every transition produces exactly one `engine_dtc_events` row, which is what the diagnostic
 * event timeline is built from. Keeping the machine pure makes the lifecycle unit-testable
 * without a database.
 */

import type { DtcEventType, DtcSeverity, DtcStatus, EngineDtc } from '@geoventra/contracts';

export type DtcAction = 'detect' | 'acknowledge' | 'resolve' | 'clear';

export interface DtcTransitionInput {
  /** The current DTC row, or `null` when the code has never been seen on this vehicle. */
  current: EngineDtc | null;
  action: DtcAction;
  /** Severity to assign when a DTC is first detected. */
  severity: DtcSeverity;
  /** Whether the malfunction indicator lamp is illuminated. */
  milOn: boolean;
}

export interface DtcTransition {
  status: DtcStatus;
  eventType: DtcEventType;
  acknowledged: boolean;
  resolved: boolean;
  occurrenceCount: number;
  milOn: boolean;
  /** True when the transition requires a freeze frame to be captured. */
  captureFreezeFrame: boolean;
}

export class InvalidDtcTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidDtcTransitionError';
  }
}

/**
 * Compute the next state of a DTC.
 *
 * `detect` on an unknown code creates an `active` DTC. `detect` on a known code increments the
 * occurrence counter; if the code had already been cleared the fault has recurred and the DTC
 * becomes active again with the acknowledgement reset.
 */
export function transitionDtc(input: DtcTransitionInput): DtcTransition {
  const { current, action, severity, milOn } = input;

  switch (action) {
    case 'detect': {
      if (!current) {
        return {
          status: 'active',
          eventType: 'detected',
          acknowledged: false,
          resolved: false,
          occurrenceCount: 1,
          milOn,
          captureFreezeFrame: true,
        };
      }
      if (current.resolved || current.status === 'cleared' || current.status === 'historical') {
        return {
          status: 'active',
          eventType: 'reoccurred',
          acknowledged: false,
          resolved: false,
          occurrenceCount: current.occurrenceCount + 1,
          milOn,
          captureFreezeFrame: true,
        };
      }
      return {
        status: current.status === 'pending' ? 'active' : current.status,
        eventType: 'updated',
        acknowledged: current.acknowledged,
        resolved: false,
        occurrenceCount: current.occurrenceCount + 1,
        milOn: current.milOn || milOn,
        captureFreezeFrame: false,
      };
    }

    case 'acknowledge': {
      if (!current) {
        throw new InvalidDtcTransitionError('Cannot acknowledge a DTC that does not exist');
      }
      if (current.status === 'cleared' || current.status === 'historical') {
        throw new InvalidDtcTransitionError(
          `Cannot acknowledge a DTC in the "${current.status}" state`,
        );
      }
      return {
        status: 'acknowledged',
        eventType: 'acknowledged',
        acknowledged: true,
        resolved: current.resolved,
        occurrenceCount: current.occurrenceCount,
        milOn: current.milOn,
        captureFreezeFrame: false,
      };
    }

    case 'resolve': {
      if (!current) {
        throw new InvalidDtcTransitionError('Cannot resolve a DTC that does not exist');
      }
      if (current.status === 'cleared' || current.status === 'historical') {
        throw new InvalidDtcTransitionError(
          `Cannot resolve a DTC in the "${current.status}" state`,
        );
      }
      return {
        status: 'cleared',
        eventType: 'resolved',
        acknowledged: current.acknowledged,
        resolved: true,
        occurrenceCount: current.occurrenceCount,
        milOn: false,
        captureFreezeFrame: true,
      };
    }

    case 'clear': {
      if (!current) {
        throw new InvalidDtcTransitionError('Cannot clear a DTC that does not exist');
      }
      if (current.status === 'cleared' || current.status === 'historical') {
        // Already cleared — record the event but keep the state.
        return {
          status: current.status,
          eventType: 'cleared',
          acknowledged: current.acknowledged,
          resolved: true,
          occurrenceCount: current.occurrenceCount,
          milOn: false,
          captureFreezeFrame: false,
        };
      }
      return {
        status: 'cleared',
        eventType: 'cleared',
        acknowledged: current.acknowledged,
        resolved: true,
        occurrenceCount: current.occurrenceCount,
        milOn: false,
        captureFreezeFrame: true,
      };
    }

    default: {
      const exhaustive: never = action;
      throw new InvalidDtcTransitionError(`Unknown DTC action: ${String(exhaustive)}`);
    }
  }
}

/** Whether a DTC is still live (i.e. contributes to the vehicle's health score). */
export function isLiveDtc(dtc: Pick<EngineDtc, 'status' | 'resolved'>): boolean {
  return !dtc.resolved && dtc.status !== 'cleared' && dtc.status !== 'historical';
}
