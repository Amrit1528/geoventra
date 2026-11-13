-- ==========================================================================
-- Retention / cleanup indices (phase 2).
--
-- Adds the indices that support the tracking history retention sweep and
-- installs `geoventra.clean_tracking_history()`, the routine that prunes
-- expired GPS positions, trip events, stops and stale live status rows.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE INDEX idx_gps_positions_brin_time ON geoventra.gps_positions USING brin (recorded_at) WITH (pages_per_range='32');

CREATE INDEX idx_gps_positions_device_time ON geoventra.gps_positions USING btree (device_id, recorded_at DESC);

CREATE INDEX idx_gps_positions_org_time ON geoventra.gps_positions USING btree (organisation_id, recorded_at DESC);

CREATE INDEX idx_gps_positions_vehicle_time ON geoventra.gps_positions USING btree (vehicle_id, recorded_at DESC);

CREATE INDEX idx_speed_history_vehicle_time ON geoventra.gps_positions USING btree (vehicle_id, recorded_at DESC);

CREATE INDEX idx_trips_org_start ON geoventra.trips USING btree (organisation_id, started_at DESC);

CREATE INDEX idx_trips_status_start ON geoventra.trips USING btree (status, started_at DESC);

CREATE INDEX idx_trips_vehicle_start ON geoventra.trips USING btree (vehicle_id, started_at DESC);

CREATE INDEX idx_vehicles_org_status ON geoventra.vehicles USING btree (organisation_id, status);

CREATE FUNCTION geoventra.clean_tracking_history() RETURNS integer
    LANGUAGE plpgsql
    AS $$
DECLARE
  config_row RECORD;
  retention_days integer;
  deleted_gps integer;
  deleted_trips integer;
  deleted_stop_events integer;
  deleted_stops integer;
  deleted_live_status integer;
BEGIN
  -- Find retention config (default 7 days)
  SELECT retention_days INTO retention_days
  FROM retention_config
  WHERE organisation_id = (SELECT id FROM organisations ORDER BY id LIMIT 1);

  IF retention_days IS NULL THEN
    retention_days := 7;
  END IF;

  -- Clean expired historical records (do NOT delete active trip data)
  DELETE FROM gps_positions
   WHERE recorded_at < now() - interval '7 days'
     AND recorded_at NOT IN (
       SELECT recorded_at FROM trips WHERE status = 'active'
     );
  GET DIAGNOSTICS deleted_gps = ROW_COUNT;

  DELETE FROM trip_events
   WHERE occurred_at < now() - interval '7 days'
     AND trip_id NOT IN (SELECT id FROM trips WHERE status = 'active');
  GET DIAGNOSTICS deleted_trips = ROW_COUNT;

  DELETE FROM stop_events
   WHERE occurred_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_stop_events = ROW_COUNT;

  DELETE FROM stops
   WHERE confirmed_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_stops = ROW_COUNT;

  -- Clean live status for vehicles with no position for 7+ days
  DELETE FROM vehicle_live_status
   WHERE last_recorded_at < now() - interval '7 days';
  GET DIAGNOSTICS deleted_live_status = ROW_COUNT;

  -- Update config timestamps
  UPDATE retention_config
   SET last_cleaned_at = now()
   WHERE organisation_id = (SELECT id FROM organisations ORDER BY id LIMIT 1);

  RAISE NOTICE 'Cleanup complete: gps=% trips=% stops=% stop_events=% live_status=%',
    deleted_gps, deleted_trips, deleted_stop_events, deleted_stop_events, deleted_live_status;
  RETURN 1;
END;
$$;
