-- ==========================================================================
-- Engine diagnostics Phase 5.1 — live operations (2026-11-13).
--
-- This migration is purely additive:
--
--   1. Permissions `engine.read`, `engine.write` and `engine.ingest` are created
--      and granted to the built-in roles (owner → all, admin → all, manager →
--      read+write, viewer → read). The `permissions` table is the single
--      source of truth for role-based authorisation, so the API can gate the
--      engine feature set with `@RequirePermissions('engine.read')`.
--   2. A unique index on `engine_health_alerts (organisation_id, vehicle_id,
--      rule_id)` is created. The Phase 5.1 ingestion pipeline upserts alerts
--      from this triple; without the index the upsert is not idempotent.
--   3. Default recovery policies for the built-in rules are inserted for every
--      organisation (idempotent). Recovery policies describe how many healthy
--      samples are required before an alert auto-resolves.
--   4. Indexes supporting the Phase 5.1 query patterns are added:
--      - the DTC list filtered by vehicle + status, and
--      - the diagnostic event timeline ordered by occurrence time.
--
-- Deliberately NOT included:
--   * No table is dropped or recreated; existing data in `geoventra` is untouched.
--   * No column is dropped; the freeze-frame contract is already stored on
--     `engine_dtcs.freeze_frame` (jsonb) and readings already carry
--     source/quality provenance, which the "historical diagnostics" surface
--     needs for auditability.
-- ==========================================================================

SET search_path TO geoventra, public;

-- ── 1. Permissions ─────────────────────────────────────────────────────────

INSERT INTO geoventra.permissions (code, description)
VALUES
    ('engine.read',   'Read engine diagnostics, DTCs, freeze frames, health charts and alerts'),
    ('engine.write',  'Acknowledge/resolve engine DTCs and alerts'),
    ('engine.ingest', 'Submit engine telemetry and DTCs through the ingest endpoint')
ON CONFLICT DO NOTHING;

-- Owner receives every permission, including the new engine ones.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.organisations o ON o.id = r.organisation_id
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'owner'
   AND p.code IN ('engine.read', 'engine.write', 'engine.ingest')
   AND o.id = r.organisation_id
ON CONFLICT DO NOTHING;

-- Admin receives the same set (audit/administration stays unrestricted for owners).
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.organisations o ON o.id = r.organisation_id
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'admin'
   AND p.code IN ('engine.read', 'engine.write', 'engine.ingest')
ON CONFLICT DO NOTHING;

-- Manager: operational read/write, no ingest key issuance.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'manager'
   AND p.code IN ('engine.read', 'engine.write')
ON CONFLICT DO NOTHING;

-- Viewer: read only.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'viewer'
   AND p.code = 'engine.read'
ON CONFLICT DO NOTHING;

-- ── 2. Unique index for idempotent alert upsert ────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS engine_health_alerts_org_vehicle_rule_key
    ON geoventra.engine_health_alerts (organisation_id, vehicle_id, rule_id);

-- ── 3. Default recovery policies ───────────────────────────────────────────
-- Recovery values are the healthy side of the built-in thresholds. An alert
-- auto-resolves after `recovery_count` consecutive healthy samples.

INSERT INTO geoventra.engine_recovery_policies
    (organisation_id, rule_id, recovery_value, recovery_count, enabled)
SELECT o.id, v.rule_id, v.recovery_value, v.recovery_count, TRUE
  FROM geoventra.organisations o
  CROSS JOIN (
        VALUES
            ('engine_overheating', 100.0, 3),
            ('high_rpm',            5500.0, 3),
            ('low_voltage',         12.4, 2),
            ('mil_active',          0.0, 1)
      ) AS v(rule_id, recovery_value, recovery_count)
ON CONFLICT (organisation_id, rule_id) DO NOTHING;

-- ── 4. Phase 5.1 indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS engine_dtcs_org_vehicle_status_idx
    ON geoventra.engine_dtcs (organisation_id, vehicle_id, status);

CREATE INDEX IF NOT EXISTS engine_dtc_events_org_vehicle_time_idx
    ON geoventra.engine_dtc_events (organisation_id, vehicle_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS engine_telemetry_org_vehicle_metric_time_idx
    ON geoventra.engine_telemetry_readings (organisation_id, vehicle_id, metric, recorded_at DESC);

CREATE INDEX IF NOT EXISTS engine_health_alerts_org_vehicle_resolved_idx
    ON geoventra.engine_health_alerts (organisation_id, vehicle_id, resolved, severity);
