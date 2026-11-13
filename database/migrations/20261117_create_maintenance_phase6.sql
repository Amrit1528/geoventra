-- ==========================================================================
-- Maintenance phase 6 (phase 6).
--
-- Creates the predictive maintenance domain: vehicle_health_scores,
-- vehicle_health_score_history, maintenance_rules, maintenance_predictions,
-- maintenance_providers, maintenance_work_orders,
-- maintenance_work_order_items and maintenance_cost_records.
-- ==========================================================================

SET search_path TO geoventra, public;

CREATE TABLE geoventra.vehicle_health_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    score integer NOT NULL,
    grade text NOT NULL,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    coverage jsonb DEFAULT '{}'::jsonb NOT NULL,
    reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    source text DEFAULT 'deterministic'::text NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_health_scores_grade_check CHECK ((grade = ANY (ARRAY['excellent'::text, 'good'::text, 'attention'::text, 'poor'::text, 'critical'::text]))),
    CONSTRAINT vehicle_health_scores_score_check CHECK (((score >= 0) AND (score <= 100)))
);

CREATE TABLE geoventra.vehicle_health_score_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    score integer NOT NULL,
    previous_score integer,
    change numeric(6,2) DEFAULT 0 NOT NULL,
    grade text NOT NULL,
    components jsonb DEFAULT '{}'::jsonb NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    coverage jsonb DEFAULT '{}'::jsonb NOT NULL,
    reasons jsonb DEFAULT '[]'::jsonb NOT NULL,
    calculated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT vehicle_health_score_history_grade_check CHECK ((grade = ANY (ARRAY['excellent'::text, 'good'::text, 'attention'::text, 'poor'::text, 'critical'::text]))),
    CONSTRAINT vehicle_health_score_history_score_check CHECK (((score >= 0) AND (score <= 100)))
);

CREATE TABLE geoventra.maintenance_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid,
    category text NOT NULL,
    rule_key text NOT NULL,
    name text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    rule_type text NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    cooldown_hours integer DEFAULT 24 NOT NULL,
    evaluation_window_hours integer DEFAULT 72 NOT NULL,
    source text DEFAULT 'deterministic'::text NOT NULL,
    model_version text DEFAULT 'rules-2026.1'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_rules_rule_type_check CHECK ((rule_type = ANY (ARRAY['threshold'::text, 'pattern'::text, 'schedule'::text])))
);

CREATE TABLE geoventra.maintenance_predictions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    prediction_key text NOT NULL,
    category text NOT NULL,
    predicted_issue text NOT NULL,
    issue_title text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    risk_level text NOT NULL,
    confidence numeric(5,4) DEFAULT 0 NOT NULL,
    severity text DEFAULT 'medium'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    evidence jsonb DEFAULT '[]'::jsonb NOT NULL,
    telemetry_refs jsonb DEFAULT '[]'::jsonb NOT NULL,
    recommended_action text DEFAULT ''::text NOT NULL,
    recommended_service_date date,
    estimated_remaining_distance_km numeric(12,2),
    predicted_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '30 days'::interval) NOT NULL,
    resolved_at timestamp with time zone,
    model_version text DEFAULT 'rules-2026.1'::text NOT NULL,
    source_classification text DEFAULT 'actual_sensor'::text NOT NULL,
    data_coverage jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_predictions_risk_level_check CHECK ((risk_level = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT maintenance_predictions_status_check CHECK ((status = ANY (ARRAY['active'::text, 'accepted'::text, 'dismissed'::text, 'expired'::text, 'superseded'::text])))
);

CREATE TABLE geoventra.maintenance_providers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    name text NOT NULL,
    contact_name text,
    phone text,
    email text,
    address text,
    specialty text,
    rating numeric(3,2),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE geoventra.maintenance_work_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    prediction_id uuid,
    work_order_number text NOT NULL,
    category text NOT NULL,
    priority text DEFAULT 'medium'::text NOT NULL,
    issue_description text NOT NULL,
    recommended_work text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    workshop_id uuid,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    odometer_km numeric(12,2),
    engine_hours numeric(10,2),
    labour_cost numeric(12,2) DEFAULT 0 NOT NULL,
    parts_cost numeric(12,2) DEFAULT 0 NOT NULL,
    total_cost numeric(12,2) DEFAULT 0 NOT NULL,
    notes text,
    created_by uuid,
    completed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_work_orders_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text]))),
    CONSTRAINT maintenance_work_orders_status_check CHECK ((status = ANY (ARRAY['scheduled'::text, 'assigned'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);

CREATE TABLE geoventra.maintenance_work_order_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    work_order_id uuid NOT NULL,
    kind text NOT NULL,
    description text NOT NULL,
    quantity numeric(10,2) DEFAULT 1 NOT NULL,
    unit_cost numeric(12,2) DEFAULT 0 NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_work_order_items_kind_check CHECK ((kind = ANY (ARRAY['labour'::text, 'part'::text])))
);

CREATE TABLE geoventra.maintenance_cost_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organisation_id uuid NOT NULL,
    vehicle_id uuid NOT NULL,
    work_order_id uuid,
    maintenance_record_id uuid,
    category text NOT NULL,
    cost_type text NOT NULL,
    labour_cost numeric(12,2) DEFAULT 0 NOT NULL,
    parts_cost numeric(12,2) DEFAULT 0 NOT NULL,
    total_cost numeric(12,2) DEFAULT 0 NOT NULL,
    performed_at timestamp with time zone DEFAULT now() NOT NULL,
    odometer_km numeric(12,2),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_cost_records_cost_type_check CHECK ((cost_type = ANY (ARRAY['preventive'::text, 'breakdown'::text, 'inspection'::text])))
);

ALTER TABLE ONLY geoventra.maintenance_cost_records
    ADD CONSTRAINT maintenance_cost_records_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.maintenance_predictions
    ADD CONSTRAINT maintenance_predictions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.maintenance_providers
    ADD CONSTRAINT maintenance_providers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.maintenance_rules
    ADD CONSTRAINT maintenance_rules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.maintenance_work_order_items
    ADD CONSTRAINT maintenance_work_order_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.vehicle_health_score_history
    ADD CONSTRAINT vehicle_health_score_history_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.vehicle_health_scores
    ADD CONSTRAINT vehicle_health_scores_pkey PRIMARY KEY (id);

ALTER TABLE ONLY geoventra.maintenance_rules
    ADD CONSTRAINT maintenance_rules_organisation_id_vehicle_id_rule_key_key UNIQUE (organisation_id, vehicle_id, rule_key);

ALTER TABLE ONLY geoventra.maintenance_cost_records
    ADD CONSTRAINT maintenance_cost_records_maintenance_record_id_fkey FOREIGN KEY (maintenance_record_id) REFERENCES geoventra.maintenance_records(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.maintenance_cost_records
    ADD CONSTRAINT maintenance_cost_records_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_cost_records
    ADD CONSTRAINT maintenance_cost_records_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_cost_records
    ADD CONSTRAINT maintenance_cost_records_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES geoventra.maintenance_work_orders(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.maintenance_predictions
    ADD CONSTRAINT maintenance_predictions_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_predictions
    ADD CONSTRAINT maintenance_predictions_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_providers
    ADD CONSTRAINT maintenance_providers_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_rules
    ADD CONSTRAINT maintenance_rules_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_rules
    ADD CONSTRAINT maintenance_rules_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_work_order_items
    ADD CONSTRAINT maintenance_work_order_items_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_work_order_items
    ADD CONSTRAINT maintenance_work_order_items_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES geoventra.maintenance_work_orders(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_completed_by_fkey FOREIGN KEY (completed_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_created_by_fkey FOREIGN KEY (created_by) REFERENCES geoventra.users(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_prediction_id_fkey FOREIGN KEY (prediction_id) REFERENCES geoventra.maintenance_predictions(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.maintenance_work_orders
    ADD CONSTRAINT maintenance_work_orders_workshop_id_fkey FOREIGN KEY (workshop_id) REFERENCES geoventra.maintenance_providers(id) ON DELETE SET NULL;

ALTER TABLE ONLY geoventra.vehicle_health_score_history
    ADD CONSTRAINT vehicle_health_score_history_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_health_score_history
    ADD CONSTRAINT vehicle_health_score_history_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_health_scores
    ADD CONSTRAINT vehicle_health_scores_organisation_id_fkey FOREIGN KEY (organisation_id) REFERENCES geoventra.organisations(id) ON DELETE CASCADE;

ALTER TABLE ONLY geoventra.vehicle_health_scores
    ADD CONSTRAINT vehicle_health_scores_vehicle_id_fkey FOREIGN KEY (vehicle_id) REFERENCES geoventra.vehicles(id) ON DELETE CASCADE;

CREATE INDEX maintenance_cost_records_org_period_idx ON geoventra.maintenance_cost_records USING btree (organisation_id, performed_at DESC);

CREATE INDEX maintenance_cost_records_org_vehicle_idx ON geoventra.maintenance_cost_records USING btree (organisation_id, vehicle_id, performed_at DESC);

CREATE INDEX maintenance_predictions_org_predicted_idx ON geoventra.maintenance_predictions USING btree (organisation_id, predicted_at DESC);

CREATE INDEX maintenance_predictions_org_status_idx ON geoventra.maintenance_predictions USING btree (organisation_id, status, predicted_at DESC);

CREATE INDEX maintenance_predictions_org_vehicle_idx ON geoventra.maintenance_predictions USING btree (organisation_id, vehicle_id, status);

CREATE INDEX maintenance_providers_org_idx ON geoventra.maintenance_providers USING btree (organisation_id, is_active);

CREATE INDEX maintenance_rules_org_idx ON geoventra.maintenance_rules USING btree (organisation_id, vehicle_id, enabled);

CREATE INDEX maintenance_work_order_items_wo_idx ON geoventra.maintenance_work_order_items USING btree (work_order_id, kind);

CREATE INDEX maintenance_work_orders_org_created_idx ON geoventra.maintenance_work_orders USING btree (organisation_id, created_at DESC);

CREATE INDEX maintenance_work_orders_org_status_idx ON geoventra.maintenance_work_orders USING btree (organisation_id, status, created_at DESC);

CREATE INDEX maintenance_work_orders_org_vehicle_idx ON geoventra.maintenance_work_orders USING btree (organisation_id, vehicle_id, status);

CREATE INDEX vehicle_health_score_history_org_calculated_idx ON geoventra.vehicle_health_score_history USING btree (organisation_id, calculated_at DESC);

CREATE INDEX vehicle_health_score_history_org_vehicle_idx ON geoventra.vehicle_health_score_history USING btree (organisation_id, vehicle_id, calculated_at DESC);

CREATE INDEX vehicle_health_scores_org_calculated_idx ON geoventra.vehicle_health_scores USING btree (organisation_id, calculated_at DESC);

CREATE INDEX vehicle_health_scores_org_score_idx ON geoventra.vehicle_health_scores USING btree (organisation_id, score DESC);

CREATE INDEX vehicle_health_scores_org_vehicle_idx ON geoventra.vehicle_health_scores USING btree (organisation_id, vehicle_id, calculated_at DESC);

CREATE TRIGGER maintenance_cost_records_set_updated_at BEFORE UPDATE ON geoventra.maintenance_cost_records FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER maintenance_predictions_set_updated_at BEFORE UPDATE ON geoventra.maintenance_predictions FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER maintenance_providers_set_updated_at BEFORE UPDATE ON geoventra.maintenance_providers FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER maintenance_rules_set_updated_at BEFORE UPDATE ON geoventra.maintenance_rules FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER maintenance_work_order_items_set_updated_at BEFORE UPDATE ON geoventra.maintenance_work_order_items FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER maintenance_work_orders_set_updated_at BEFORE UPDATE ON geoventra.maintenance_work_orders FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER vehicle_health_score_history_set_updated_at BEFORE UPDATE ON geoventra.vehicle_health_score_history FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();

CREATE TRIGGER vehicle_health_scores_set_updated_at BEFORE UPDATE ON geoventra.vehicle_health_scores FOR EACH ROW EXECUTE FUNCTION geoventra.set_updated_at();
