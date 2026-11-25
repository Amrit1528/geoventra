SET search_path TO geoventra, public;

-- ==========================================================================
-- Differentiating fleet intelligence features (Phase 1-6 foundation)
-- ==========================================================================

-- ── Permissions ─────────────────────────────────────────────────────────────
INSERT INTO geoventra.permissions (code, description) VALUES
  ('insights.read','View operational insight events and rules'),
  ('insights.write','Acknowledge and resolve insight events; manage rules'),
  ('scorecards.read','View driver and vehicle scorecards'),
  ('scorecards.write','Configure scorecard factors and weights'),
  ('delivery.read','View customer delivery tracking links'),
  ('delivery.write','Create and revoke customer delivery tracking links'),
  ('billing.read','View subscription plans, invoices and payment status'),
  ('billing.write','Manage subscription plans and billing records'),
  ('partners.read','View installer/reseller partners and commissions'),
  ('partners.write','Manage partners, assignments and commissions'),
  ('branding.read','View tenant branding settings'),
  ('branding.write','Update tenant branding settings')
ON CONFLICT DO NOTHING;

-- Grant to roles (reuse pattern)
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM geoventra.roles r CROSS JOIN geoventra.permissions p
 WHERE r.name IN ('owner','admin') AND p.code IN ('insights.read','insights.write','scorecards.read','scorecards.write','delivery.read','delivery.write','billing.read','billing.write','partners.read','partners.write','branding.read','branding.write')
ON CONFLICT DO NOTHING;
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM geoventra.roles r CROSS JOIN geoventra.permissions p
 WHERE r.name='manager' AND p.code IN ('insights.read','insights.write','scorecards.read','delivery.read','delivery.write','branding.read')
ON CONFLICT DO NOTHING;
INSERT INTO geoventra.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM geoventra.roles r CROSS JOIN geoventra.permissions p
 WHERE r.name='viewer' AND p.code IN ('insights.read','scorecards.read','delivery.read','branding.read','billing.read','partners.read')
ON CONFLICT DO NOTHING;

-- ── Phase 2: Operational intelligence ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.insight_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT TRUE,
  severity text NOT NULL DEFAULT 'medium',
  threshold jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, rule_type)
);
CREATE INDEX IF NOT EXISTS insight_rules_org_idx ON geoventra.insight_rules(organisation_id);

CREATE TABLE IF NOT EXISTS geoventra.insight_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES geoventra.vehicles(id) ON DELETE SET NULL,
  driver_id uuid REFERENCES geoventra.drivers(id) ON DELETE SET NULL,
  rule_type text NOT NULL,
  insight_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  title text NOT NULL,
  description text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES geoventra.users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES geoventra.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS insight_events_org_time_idx ON geoventra.insight_events(organisation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS insight_events_org_status_idx ON geoventra.insight_events(organisation_id, status, severity);
CREATE INDEX IF NOT EXISTS insight_events_vehicle_idx ON geoventra.insight_events(organisation_id, vehicle_id, occurred_at DESC);

-- ── Phase 3: Scorecards ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.scorecard_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('driver','vehicle')),
  name text NOT NULL,
  factors jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS scorecard_configs_org_idx ON geoventra.scorecard_configs(organisation_id, entity_type);

CREATE TABLE IF NOT EXISTS geoventra.scorecard_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('driver','vehicle')),
  entity_id uuid NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  overall_score numeric(5,2),
  breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  data_quality jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organisation_id, entity_type, entity_id, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS scorecard_results_entity_idx ON geoventra.scorecard_results(organisation_id, entity_type, entity_id, period_end DESC);

-- ── Phase 5: Customer delivery tracking ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.delivery_tracking_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  vehicle_id uuid REFERENCES geoventra.vehicles(id) ON DELETE SET NULL,
  trip_id uuid REFERENCES geoventra.trips(id) ON DELETE SET NULL,
  token_hash text NOT NULL UNIQUE,
  label text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_by uuid REFERENCES geoventra.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  access_count integer NOT NULL DEFAULT 0,
  last_accessed_at timestamptz,
  permitted_fields jsonb NOT NULL DEFAULT '["location","status","eta"]'::jsonb
);
CREATE INDEX IF NOT EXISTS delivery_links_org_idx ON geoventra.delivery_tracking_links(organisation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS geoventra.delivery_tracking_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  link_id uuid NOT NULL REFERENCES geoventra.delivery_tracking_links(id) ON DELETE CASCADE,
  accessed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  outcome text NOT NULL DEFAULT 'ok'
);
CREATE INDEX IF NOT EXISTS delivery_access_log_link_idx ON geoventra.delivery_tracking_access_log(link_id, accessed_at DESC);

-- ── Phase 6: Pricing, partners, white-label ────────────────────────────────
CREATE TABLE IF NOT EXISTS geoventra.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  price_cents integer,
  currency text NOT NULL DEFAULT 'INR',
  vehicle_limit integer,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geoventra.tenant_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES geoventra.subscription_plans(id),
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  vehicle_count integer NOT NULL DEFAULT 0,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  provider_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tenant_subscriptions_org_idx ON geoventra.tenant_subscriptions(organisation_id, status);

CREATE TABLE IF NOT EXISTS geoventra.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES geoventra.tenant_subscriptions(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  status text NOT NULL DEFAULT 'draft',
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  provider_ref text,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS invoices_org_idx ON geoventra.invoices(organisation_id, created_at DESC);

CREATE TABLE IF NOT EXISTS geoventra.partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  partner_type text NOT NULL CHECK (partner_type IN ('installer','reseller','integrator')),
  contact_name text,
  contact_email text,
  contact_phone text,
  commission_rate numeric(6,3) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS geoventra.partner_customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES geoventra.partners(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, organisation_id)
);

CREATE TABLE IF NOT EXISTS geoventra.partner_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES geoventra.partners(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES geoventra.vehicles(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, vehicle_id)
);

CREATE TABLE IF NOT EXISTS geoventra.commission_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES geoventra.partners(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES geoventra.organisations(id) ON DELETE SET NULL,
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR',
  period text,
  status text NOT NULL DEFAULT 'pending',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_ledger_partner_idx ON geoventra.commission_ledger(partner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS geoventra.tenant_branding (
  organisation_id uuid PRIMARY KEY REFERENCES geoventra.organisations(id) ON DELETE CASCADE,
  company_name text,
  logo_url text,
  primary_color text,
  secondary_color text,
  custom_domain text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
