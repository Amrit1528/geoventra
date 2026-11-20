-- Allow fleet group names to be reused after a group is archived (soft-deleted),
-- while keeping names unique among active groups.
ALTER TABLE geoventra.vehicle_groups
  DROP CONSTRAINT IF EXISTS vehicle_groups_organisation_id_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS vehicle_groups_org_name_active_uidx
  ON geoventra.vehicle_groups (organisation_id, name)
  WHERE is_archived = false;