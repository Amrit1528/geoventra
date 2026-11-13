-- ==========================================================================
-- Vehicle category extension (phase 4).
--
-- Widens `vehicles.category` from the original three value domain to the full
-- fleet taxonomy: car, truck, trailer_truck, bus, van, pickup, motorcycle,
-- tractor and construction.
-- ==========================================================================

SET search_path TO geoventra, public;

-- Widen the vehicle category domain to cover the full fleet taxonomy.
ALTER TABLE geoventra.vehicles
    DROP CONSTRAINT IF EXISTS vehicles_category_check;

ALTER TABLE geoventra.vehicles
    ADD CONSTRAINT vehicles_category_check CHECK (
        category = ANY (ARRAY[
            'car'::text, 'truck'::text, 'trailer_truck'::text, 'bus'::text,
            'van'::text, 'pickup'::text, 'motorcycle'::text, 'tractor'::text,
            'construction'::text
        ])
    );
