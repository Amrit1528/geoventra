-- ==========================================================================
-- TPMS permissions (P2).
--
-- Adds permissions for the Tyre Pressure Monitoring System and grants them to
-- the system roles. Additive only: no existing permission or grant is removed.
-- ==========================================================================

SET search_path TO geoventra, public;

INSERT INTO geoventra.permissions (code, description)
VALUES
  ('tpms.read',   'View TPMS dashboards, tyre status, sensor readings and reports'),
  ('tpms.write',  'Configure tyre layouts, assign sensors and manage TPMS lifecycle records'),
  ('tpms.ingest', 'Submit TPMS telemetry readings through the ingest endpoint')
ON CONFLICT (code) DO NOTHING;

-- Owner: every TPMS capability.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.permissions p ON p.code IN ('tpms.read', 'tpms.write', 'tpms.ingest')
 WHERE r.name = 'owner'
ON CONFLICT DO NOTHING;

-- Admin: full operational TPMS access.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.permissions p ON p.code IN ('tpms.read', 'tpms.write', 'tpms.ingest')
 WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- Manager: operational TPMS access.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.permissions p ON p.code IN ('tpms.read', 'tpms.write', 'tpms.ingest')
 WHERE r.name = 'manager'
ON CONFLICT DO NOTHING;

-- Viewer: read-only TPMS access.
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM geoventra.roles r
  JOIN geoventra.permissions p ON p.code = 'tpms.read'
 WHERE r.name = 'viewer'
ON CONFLICT DO NOTHING;
