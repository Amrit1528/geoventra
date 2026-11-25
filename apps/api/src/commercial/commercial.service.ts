import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../common/infrastructure/database.service.js';

@Injectable()
export class CommercialService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // ── Plans ──
  async listPlans() { return this.db.query(`SELECT * FROM geoventra.subscription_plans WHERE active=TRUE ORDER BY created_at`); }
  async createPlan(body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.subscription_plans (code,name,description,price_cents,currency,vehicle_limit,features,active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8) RETURNING *`,
      [body.code, body.name, body.description ?? null, body.priceCents ?? null, body.currency ?? 'INR', body.vehicleLimit ?? null, JSON.stringify(body.features ?? []), body.active ?? true],
    );
  }
  async updatePlan(id: string, body: any) {
    const fields = ['updated_at=now()']; const params: any[] = []; let i=1;
    for (const [k,v] of Object.entries(body ?? {})) {
      const col = k === 'priceCents' ? 'price_cents' : k === 'vehicleLimit' ? 'vehicle_limit' : k;
      if (!['name','description','price_cents','currency','vehicle_limit','features','active'].includes(col)) continue;
      if (col === 'features') { fields.push(`features=$${i++}::jsonb`); params.push(JSON.stringify(v)); }
      else { fields.push(`${col}=$${i++}`); params.push(v); }
    }
    params.push(id);
    return this.db.queryOne(`UPDATE geoventra.subscription_plans SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, params);
  }

  // ── Subscriptions ──
  async listSubscriptions(organisationId: string) { return this.db.query(`SELECT s.*, p.name AS plan_name, p.code AS plan_code FROM geoventra.tenant_subscriptions s JOIN geoventra.subscription_plans p ON p.id=s.plan_id WHERE s.organisation_id=$1 ORDER BY s.created_at DESC`, [organisationId]); }
  async createSubscription(organisationId: string, body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.tenant_subscriptions (organisation_id, plan_id, status, started_at, ends_at, vehicle_count, billing_cycle, provider_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [organisationId, body.planId, body.status ?? 'active', body.startedAt ?? new Date().toISOString(), body.endsAt ?? null, body.vehicleCount ?? 0, body.billingCycle ?? 'monthly', body.providerRef ?? null],
    );
  }
  async updateSubscription(organisationId: string, id: string, body: any) {
    const fields = ['updated_at=now()']; const params: any[] = []; let i=1;
    for (const [k,v] of Object.entries(body ?? {})) {
      const col = k === 'vehicleCount' ? 'vehicle_count' : k === 'billingCycle' ? 'billing_cycle' : k === 'providerRef' ? 'provider_ref' : k === 'startedAt' ? 'started_at' : k === 'endsAt' ? 'ends_at' : k;
      if (!['status','vehicle_count','billing_cycle','provider_ref','started_at','ends_at'].includes(col)) continue;
      fields.push(`${col}=$${i++}`); params.push(v);
    }
    params.push(organisationId, id);
    return this.db.queryOne(`UPDATE geoventra.tenant_subscriptions SET ${fields.join(',')} WHERE organisation_id=$${i} AND id=$${i+1} RETURNING *`, params);
  }

  // ── Invoices ──
  async listInvoices(organisationId: string) { return this.db.query(`SELECT * FROM geoventra.invoices WHERE organisation_id=$1 ORDER BY created_at DESC`, [organisationId]); }
  async createInvoice(organisationId: string, body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.invoices (organisation_id, subscription_id, amount_cents, currency, status, issued_at, due_at, paid_at, provider_ref, line_items)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING *`,
      [organisationId, body.subscriptionId ?? null, body.amountCents ?? 0, body.currency ?? 'INR', body.status ?? 'draft', body.issuedAt ?? null, body.dueAt ?? null, body.paidAt ?? null, body.providerRef ?? null, JSON.stringify(body.lineItems ?? [])],
    );
  }
  async updateInvoice(organisationId: string, id: string, body: any) {
    const fields = ['updated_at=now()']; const params: any[] = []; let i=1;
    const map: Record<string,string> = { amountCents:'amount_cents', providerRef:'provider_ref', issuedAt:'issued_at', dueAt:'due_at', paidAt:'paid_at', lineItems:'line_items' };
    for (const [k,v] of Object.entries(body ?? {})) {
      const col = map[k] ?? k;
      if (!['status','amount_cents','currency','provider_ref','issued_at','due_at','paid_at','line_items'].includes(col)) continue;
      if (col === 'line_items') { fields.push(`line_items=$${i++}::jsonb`); params.push(JSON.stringify(v)); }
      else { fields.push(`${col}=$${i++}`); params.push(v); }
    }
    params.push(organisationId, id);
    return this.db.queryOne(`UPDATE geoventra.invoices SET ${fields.join(',')} WHERE organisation_id=$${i} AND id=$${i+1} RETURNING *`, params);
  }

  // ── Partners ──
  async listPartners() { return this.db.query(`SELECT * FROM geoventra.partners ORDER BY created_at DESC`); }
  async createPartner(body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.partners (name, partner_type, contact_name, contact_email, contact_phone, commission_rate, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [body.name, body.partnerType, body.contactName ?? null, body.contactEmail ?? null, body.contactPhone ?? null, body.commissionRate ?? 0, body.status ?? 'active', body.notes ?? null],
    );
  }
  async updatePartner(id: string, body: any) {
    const fields = ['updated_at=now()']; const params: any[] = []; let i=1;
    const map: Record<string,string> = { partnerType:'partner_type', contactName:'contact_name', contactEmail:'contact_email', contactPhone:'contact_phone', commissionRate:'commission_rate' };
    for (const [k,v] of Object.entries(body ?? {})) {
      const col = map[k] ?? k;
      if (!['name','partner_type','contact_name','contact_email','contact_phone','commission_rate','status','notes'].includes(col)) continue;
      fields.push(`${col}=$${i++}`); params.push(v);
    }
    params.push(id);
    return this.db.queryOne(`UPDATE geoventra.partners SET ${fields.join(',')} WHERE id=$${i} RETURNING *`, params);
  }
  async assignCustomer(partnerId: string, organisationId: string) {
    return this.db.queryOne(`INSERT INTO geoventra.partner_customers (partner_id, organisation_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`, [partnerId, organisationId]);
  }
  async listCustomers(partnerId: string) { return this.db.query(`SELECT pc.*, o.name AS organisation_name FROM geoventra.partner_customers pc LEFT JOIN geoventra.organisations o ON o.id=pc.organisation_id WHERE pc.partner_id=$1`, [partnerId]); }
  async assignVehicle(partnerId: string, vehicleId: string) {
    return this.db.queryOne(`INSERT INTO geoventra.partner_vehicles (partner_id, vehicle_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`, [partnerId, vehicleId]);
  }
  async listVehicles(partnerId: string) { return this.db.query(`SELECT pv.*, v.registration_number FROM geoventra.partner_vehicles pv LEFT JOIN geoventra.vehicles v ON v.id=pv.vehicle_id WHERE pv.partner_id=$1`, [partnerId]); }
  async listCommissions(partnerId: string) { return this.db.query(`SELECT * FROM geoventra.commission_ledger WHERE partner_id=$1 ORDER BY created_at DESC`, [partnerId]); }
  async createCommission(body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.commission_ledger (partner_id, organisation_id, amount_cents, currency, period, status, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [body.partnerId, body.organisationId ?? null, body.amountCents ?? 0, body.currency ?? 'INR', body.period ?? null, body.status ?? 'pending', body.description ?? null],
    );
  }

  // ── Branding ──
  async getBranding(organisationId: string) {
    const row = await this.db.queryOne(`SELECT * FROM geoventra.tenant_branding WHERE organisation_id=$1`, [organisationId]);
    return row ?? { organisation_id: organisationId };
  }
  async upsertBranding(organisationId: string, body: any) {
    return this.db.queryOne(
      `INSERT INTO geoventra.tenant_branding (organisation_id, company_name, logo_url, primary_color, secondary_color, custom_domain, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,now())
       ON CONFLICT (organisation_id) DO UPDATE SET company_name=EXCLUDED.company_name, logo_url=EXCLUDED.logo_url, primary_color=EXCLUDED.primary_color, secondary_color=EXCLUDED.secondary_color, custom_domain=EXCLUDED.custom_domain, updated_at=now()
       RETURNING *`,
      [organisationId, body.companyName ?? null, body.logoUrl ?? null, body.primaryColor ?? null, body.secondaryColor ?? null, body.customDomain ?? null],
    );
  }
}
