CREATE TABLE IF NOT EXISTS geoventra.dispatch_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  request_number text NOT NULL,
  pickup_label text,
  pickup_latitude double precision,
  pickup_longitude double precision,
  destination_label text,
  destination_latitude double precision,
  destination_longitude double precision,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'pending',
  vehicle_id uuid REFERENCES geoventra.vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES geoventra.drivers(id) ON DELETE SET NULL,
  scheduled_departure timestamptz,
  customer_reference text,
  instructions text,
  created_by uuid REFERENCES geoventra.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geoventra.dispatch_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES geoventra.dispatch_requests(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  sequence integer NOT NULL,
  label text,
  latitude double precision,
  longitude double precision,
  status text NOT NULL DEFAULT 'pending',
  planned_arrival timestamptz,
  actual_arrival timestamptz,
  departed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispatch_org_status ON geoventra.dispatch_requests (organisation_id, status);
CREATE INDEX IF NOT EXISTS idx_dispatch_org_vehicle ON geoventra.dispatch_requests (organisation_id, vehicle_id);
