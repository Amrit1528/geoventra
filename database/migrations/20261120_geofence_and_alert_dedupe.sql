-- ==========================================================================
-- Trips + geofencing P0 — duplicate-alert prevention (2026-11-13).
--
-- 1. Adds a partial unique index on `alerts.dedupe_key` so the geofence/trip
--    alerting path can safely de-duplicate with `ON CONFLICT DO NOTHING`.
--    Only rows WITH a dedupe key are constrained, and the application puts a
--    time bucket in the key (`geofence:<id>:<vehicle>:<type>:<hour>`), so a
--    vehicle re-entering a geofence in the next hour still alerts. Existing
--    rows have NULL dedupe_key and are unaffected.
-- 2. Adds an index over `vehicle_geofence_state (organisation_id, vehicle_id)`
--    to keep the ingest-time geofence evaluation O(geofences) per sample with
--    a constant-time state lookup.
-- 3. Adds an index over `trip_events (vehicle_id, type)` for the trip-detail
--    and route-playback queries.
--
-- No table or column is dropped or recreated; existing data is untouched.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE UNIQUE INDEX IF NOT EXISTS alerts_dedupe_key_idx
    ON geoventra.alerts (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS vehicle_geofence_state_org_vehicle_idx
    ON geoventra.vehicle_geofence_state (organisation_id, vehicle_id);

CREATE INDEX IF NOT EXISTS trip_events_vehicle_type_idx
    ON geoventra.trip_events (vehicle_id, type);
