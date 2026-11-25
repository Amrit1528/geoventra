/**
 * Shared cache invalidation for fleet-registry mutations.
 *
 * Adding, deleting or toggling a vehicle/driver/device changes data shown in
 * several views at once. Invalidating the whole set keeps every mounted view
 * in sync immediately after a successful mutation instead of waiting for a
 * manual refresh.
 */

import type { QueryClient } from '@tanstack/react-query';

const FLEET_QUERY_KEYS = [
  'vehicles',
  'drivers',
  'devices',
  'trips',
  'trip',
  'vehicle-trips',
  'recent-trip',
  'tracking-snapshot',
  'fleet-snapshot',
  'gps-freshness',
  'dashboard-active-trips',
  'dashboard-devices',
  'dashboard-engine',
  'dashboard-tpms',
  'dashboard-intelligence-fleet',
  'dashboard-intelligence-drivers',
  'dashboard-intelligence-trips',
  'engine-overview',
  'engine-vehicles',
  'engine-telemetry-latest',
  'tpms-vehicle',
  'fuel-latest',
  'maintenance-summary',
  'reports-summary',
  'reports-trips',
];

export function invalidateFleet(qc: QueryClient): void {
  for (const key of FLEET_QUERY_KEYS) void qc.invalidateQueries({ queryKey: [key] });
}

/** Device-specific mutations also affect engine/telemetry views. */
export function invalidateDevices(qc: QueryClient): void {
  invalidateFleet(qc);
  for (const key of ['device-conn', 'engine-health', 'engine-charts', 'engine-timeline', 'tpms-dashboard']) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}
