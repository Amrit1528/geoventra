-- ==========================================================================
-- Engine recovery policies (phase 6).
--
-- Creates `engine_recovery_policies`, the per organisation policy table that
-- declares how an engine alert may recover.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE geoventra.engine_recovery_policies (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    rule_id text NOT NULL,
    recovery_value double precision NOT NULL,
    recovery_count integer DEFAULT 3 NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY geoventra.engine_recovery_policies
    ADD CONSTRAINT engine_recovery_policies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.engine_recovery_policies
    ADD CONSTRAINT engine_recovery_policies_org_rule_key UNIQUE (organisation_id, rule_id);

ALTER TABLE ONLY geoventra.engine_recovery_policies
    ADD CONSTRAINT engine_recovery_policies_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

CREATE INDEX engine_recovery_policies_org_idx ON geoventra.engine_recovery_policies USING btree (organisation_id);
