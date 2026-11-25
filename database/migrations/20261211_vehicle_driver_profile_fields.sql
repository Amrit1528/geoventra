SET search_path TO geoventra, public;

-- ==========================================================================
-- Vehicle compliance fields + driver profile fields.
--
-- Vehicles gain chassis number, engine number and ownership so the "Add
-- vehicle" flow can record the full commercial-vehicle profile. The category
-- domain is widened with `light_commercial`.
--
-- Drivers gain a human-readable driver code, license class, emergency contact
-- and an explicit joining date (joined_at already exists, but was not exposed
-- by the create/update API).
-- ==========================================================================

-- ── Vehicles ────────────────────────────────────────────────────────────────
ALTER TABLE geoventra.vehicles
    ADD COLUMN IF NOT EXISTS chassis_number text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS engine_number text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS ownership text NOT NULL DEFAULT 'company_owned';

ALTER TABLE geoventra.vehicles
    DROP CONSTRAINT IF EXISTS vehicles_ownership_check;

ALTER TABLE geoventra.vehicles
    ADD CONSTRAINT vehicles_ownership_check CHECK (
        ownership = ANY (ARRAY[
            'company_owned'::text,
            'individually_owned'::text,
            'leased'::text,
            'rented'::text
        ])
    );

-- Widen the category domain to include light commercial vehicles.
ALTER TABLE geoventra.vehicles
    DROP CONSTRAINT IF EXISTS vehicles_category_check;

ALTER TABLE geoventra.vehicles
    ADD CONSTRAINT vehicles_category_check CHECK (
        category = ANY (ARRAY[
            'car'::text, 'truck'::text, 'trailer_truck'::text, 'bus'::text,
            'van'::text, 'pickup'::text, 'motorcycle'::text, 'tractor'::text,
            'construction'::text, 'light_commercial'::text
        ])
    );

CREATE INDEX IF NOT EXISTS idx_vehicles_org_chassis
    ON geoventra.vehicles (organisation_id, chassis_number);

-- ── Drivers ─────────────────────────────────────────────────────────────────
ALTER TABLE geoventra.drivers
    ADD COLUMN IF NOT EXISTS driver_code text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS license_class text,
    ADD COLUMN IF NOT EXISTS emergency_contact text;

-- Backfill a stable, per-organisation code for rows that predate the column.
WITH numbered AS (
    SELECT id,
           row_number() OVER (PARTITION BY organisation_id ORDER BY created_at, id) AS rn
      FROM geoventra.drivers
     WHERE driver_code = ''
)
UPDATE geoventra.drivers d
   SET driver_code = 'GV-DRV-' || lpad(n.rn::text, 4, '0')
  FROM numbered n
 WHERE d.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_org_driver_code
    ON geoventra.drivers (organisation_id, driver_code)
    WHERE driver_code <> '';

-- ── Devices ─────────────────────────────────────────────────────────────────
-- Protocol + upstream server are captured when registering a tracker so an
-- operator can see how a device is expected to connect before first contact.
ALTER TABLE geoventra.devices
    ADD COLUMN IF NOT EXISTS protocol text,
    ADD COLUMN IF NOT EXISTS server_address text;

