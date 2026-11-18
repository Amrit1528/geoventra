-- Add the connection columns expected by the device registration implementation.
-- The devices table previously stored only a generic `config` jsonb column, while
-- DeviceService.createDevice() inserts `connection_method` and `connection_config`.

ALTER TABLE geoventra.devices
  ADD COLUMN IF NOT EXISTS connection_method text NOT NULL DEFAULT 'api';

ALTER TABLE geoventra.devices
  ADD COLUMN IF NOT EXISTS connection_config jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Keep the two in sync with the existing generic config column for older rows.
UPDATE geoventra.devices
   SET connection_method = COALESCE(connection_method, 'api'),
       connection_config = COALESCE(connection_config, config, '{}'::jsonb)
 WHERE connection_method IS NULL
    OR connection_config IS NULL;

-- Constrain the connection method to the values used by the application.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'devices_connection_method_check'
       AND conrelid = 'geoventra.devices'::regclass
  ) THEN
    ALTER TABLE geoventra.devices
      ADD CONSTRAINT devices_connection_method_check
      CHECK (connection_method = ANY (ARRAY['api'::text, 'tcp'::text, 'mqtt'::text, 'webhook'::text]));
  END IF;
END $$;
