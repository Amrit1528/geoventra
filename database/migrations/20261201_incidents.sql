CREATE TABLE IF NOT EXISTS geoventra.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES geoventra.vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES geoventra.drivers(id) ON DELETE SET NULL,
  device_id uuid REFERENCES geoventra.devices(id) ON DELETE SET NULL,
  alert_id uuid REFERENCES geoventra.alerts(id) ON DELETE SET NULL,
  incident_number text NOT NULL,
  incident_type text NOT NULL DEFAULT 'general',
  priority text NOT NULL DEFAULT 'medium',
  description text,
  assigned_user_id uuid REFERENCES geoventra.users(id) ON DELETE SET NULL,
  due_date date,
  status text NOT NULL DEFAULT 'new',
  resolution_details text,
  response_time_seconds integer,
  resolution_time_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geoventra.incident_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES geoventra.incidents(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES geoventra.users(id) ON DELETE SET NULL,
  comment text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incidents_org_status ON geoventra.incidents (organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_org_vehicle ON geoventra.incidents (organisation_id, vehicle_id);