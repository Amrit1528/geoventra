ALTER TABLE geoventra.fuel_anomaly_alerts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fuel_anomaly_alerts_status_check'
  ) THEN
    ALTER TABLE geoventra.fuel_anomaly_alerts
      ADD CONSTRAINT fuel_anomaly_alerts_status_check
      CHECK (status IN ('new','acknowledged','investigating','resolved','false_positive'));
  END IF;
END $$;