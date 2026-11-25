ALTER TABLE geoventra.dispatch_requests
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dispatch_idempotency
  ON geoventra.dispatch_requests (organisation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dispatch_stops_dispatch ON geoventra.dispatch_stops (dispatch_id, sequence);
