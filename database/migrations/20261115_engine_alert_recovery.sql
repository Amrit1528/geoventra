-- ==========================================================================
-- Engine alert recovery (phase 6).
--
-- Adds the recovery bookkeeping columns to `engine_health_alerts`
-- (recovery_count, recovery_threshold, last_recovery_at, recovery_value and
-- resolution_reason) so that recurring engine rules can clear automatically.
-- ==========================================================================

SET search_path TO geoventra, public;

-- Recovery bookkeeping: how often a rule fired and how the alert cleared.
ALTER TABLE geoventra.engine_health_alerts
    ADD COLUMN IF NOT EXISTS recovery_count integer DEFAULT 0 NOT NULL;

ALTER TABLE geoventra.engine_health_alerts
    ADD COLUMN IF NOT EXISTS recovery_threshold integer DEFAULT 0 NOT NULL;

ALTER TABLE geoventra.engine_health_alerts
    ADD COLUMN IF NOT EXISTS last_recovery_at timestamp with time zone;

ALTER TABLE geoventra.engine_health_alerts
    ADD COLUMN IF NOT EXISTS recovery_value double precision;

ALTER TABLE geoventra.engine_health_alerts
    ADD COLUMN IF NOT EXISTS resolution_reason text;
