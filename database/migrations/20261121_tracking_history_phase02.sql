-- ==========================================================================
-- Tracking history Phase P0.2 — vehicle detail, history, stats and export.
--
-- This migration is purely additive:
--
--   1. Adds the `tracking.export` permission (CSV export of a vehicle's
--      tracking history). The history read itself reuses the existing
--      `tracking.read` permission already granted to the built-in roles.
--   2. Grants the new permission following the same matrix as the other
--      tracking permissions: owner → all, admin → all, manager → operational
--      read+export, viewer → read only.
--
-- Deliberately NOT included:
--   * No table is dropped or recreated; `gps_positions` already carries the
--     columns needed for history reads (`event_id`, `received_at`, `source`,
--     `location_name`) and the supporting indexes
--     `gps_positions_vehicle_time_idx (vehicle_id, recorded_at DESC)` and
--     `gps_positions_org_time_idx (organisation_id, recorded_at DESC)`.
-- ==========================================================================

SET search_path TO geoventra, public;

-- ── 1. Permission ───────────────────────────────────────────────────────────

INSERT INTO geoventra.permissions (code, description)
VALUES ('tracking.export', 'Export vehicle tracking history as CSV')
ON CONFLICT DO NOTHING;

-- Owner receives every permission, including the new tracking export.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.organisations o ON o.id = r.organisation_id
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'owner'
   AND p.code IN ('tracking.read', 'tracking.export')
   AND o.id = r.organisation_id
ON CONFLICT DO NOTHING;

-- Admin receives the same set (organisation administration stays owner-only).
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.organisations o ON o.id = r.organisation_id
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'admin'
   AND p.code IN ('tracking.read', 'tracking.export')
   AND o.id = r.organisation_id
ON CONFLICT DO NOTHING;

-- Manager: operational read + export.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'manager'
   AND p.code IN ('tracking.read', 'tracking.export')
ON CONFLICT DO NOTHING;

-- Viewer: read only.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  CROSS JOIN geoventra.permissions p
 WHERE r.name = 'viewer'
   AND p.code = 'tracking.read'
ON CONFLICT DO NOTHING;
