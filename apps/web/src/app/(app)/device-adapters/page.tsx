'use client';

import { type ReactElement, type ReactNode, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Cpu, Pencil, Plus, RefreshCw, Search, Server, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  KpiCard,
  LoadingPanel,
  PageLayout,
  Select,
  type SelectOption,
} from '@geoventra/ui';
import { EntityFormModal } from '@/components/ui/EntityFormModal';
import * as adapters from '@/lib/device-adapters-api';

type Tab = 'overview' | 'manufacturers' | 'models' | 'capabilities' | 'mappings' | 'configs' | 'connections' | 'audit';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'manufacturers', label: 'Manufacturers' },
  { id: 'models', label: 'Models' },
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'mappings', label: 'Field mappings' },
  { id: 'configs', label: 'Integration configs' },
  { id: 'connections', label: 'Connections' },
  { id: 'audit', label: 'Ingestion audit' },
];

const CATEGORY_OPTIONS = [
  { value: 'STANDARD_GPS', label: 'Standard GPS' },
  { value: 'AIS140', label: 'AIS140' },
];
const METHOD_OPTIONS = [
  { value: 'API', label: 'API' },
  { value: 'WEBHOOK', label: 'Webhook' },
  { value: 'MQTT', label: 'MQTT' },
  { value: 'TCP', label: 'TCP' },
];
const DATA_TYPE_OPTIONS = ['number', 'string', 'boolean', 'timestamp'].map((value) => ({ value, label: value }));
const AUTH_TYPE_OPTIONS = ['none', 'api_key', 'hmac', 'bearer', 'mtls'].map((value) => ({ value, label: value }));
const BOOLEAN_OPTIONS = [
  { value: 'true', label: 'Enabled' },
  { value: 'false', label: 'Disabled' },
];
const CONNECTION_STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unassigned', label: 'Unassigned' },
];
const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'duplicate', label: 'Duplicate' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'unauthorized', label: 'Unauthorized' },
];
const SOURCE_OPTIONS = [
  { value: '', label: 'All sources' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'webhook', label: 'Webhook' },
  { value: 'http', label: 'HTTP' },
  { value: 'tcp', label: 'TCP' },
  { value: 'api', label: 'API' },
];
const LIMIT_OPTIONS = [
  { value: '25', label: '25 rows' },
  { value: '50', label: '50 rows' },
  { value: '100', label: '100 rows' },
  { value: '200', label: '200 rows' },
];

type EditorKind = 'manufacturer' | 'model' | 'capability' | 'mapping' | 'config';
type Editor = { kind: EditorKind; id?: string; modelId?: string };

interface EditorForm {
  name: string;
  code: string;
  country: string;
  website: string;
  contactEmail: string;
  notes: string;
  manufacturerId: string;
  modelId: string;
  modelCode: string;
  deviceCategory: string;
  integrationMethod: string;
  protocolVersion: string;
  certificationRef: string;
  telemetryFields: string;
  metadata: string;
  capability: string;
  enabled: string;
  unit: string;
  sourceField: string;
  targetMetric: string;
  dataType: string;
  scale: string;
  valueOffset: string;
  deviceId: string;
  endpointUrl: string;
  authType: string;
  secretRef: string;
  headers: string;
  rateLimitPerMinute: string;
  replayWindowSeconds: string;
}

const EMPTY_FORM: EditorForm = {
  name: '', code: '', country: '', website: '', contactEmail: '', notes: '',
  manufacturerId: '', modelId: '', modelCode: '', deviceCategory: 'STANDARD_GPS', integrationMethod: 'MQTT',
  protocolVersion: '', certificationRef: '', telemetryFields: '[]', metadata: '{}',
  capability: '', enabled: 'true', unit: '',
  sourceField: '', targetMetric: '', dataType: 'number', scale: '', valueOffset: '',
  deviceId: '', endpointUrl: '', authType: 'none', secretRef: '', headers: '{}',
  rateLimitPerMinute: '120', replayWindowSeconds: '300',
};

const inputClass = 'h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]';

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }): ReactElement {
  return (
    <label className={`flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)] ${wide ? 'sm:col-span-2' : ''}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Request failed.';
}

function stringValue(value: unknown): string {
  return value === undefined || value === null ? '' : String(value);
}

function jsonValue(value: unknown): string {
  return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : '';
}

function parseObject(text: string, label: string): Record<string, unknown> {
  if (!text.trim()) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function parseArray(text: string, label: string): string[] {
  if (!text.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
  if (!Array.isArray(parsed)) throw new Error(`${label} must be a JSON array.`);
  return parsed.map((item) => String(item));
}

function numericValue(text: string, label: string): number | undefined {
  if (!text.trim()) return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`${label} must be a number.`);
  return value;
}

function formFromManufacturer(row: adapters.Manufacturer): Partial<EditorForm> {
  return {
    name: row.name, code: row.code, country: stringValue(row.country), website: stringValue(row.website),
    contactEmail: stringValue(row.contact_email), notes: stringValue(row.notes),
  };
}

function formFromModel(row: adapters.DeviceModel): Partial<EditorForm> {
  return {
    name: row.name, manufacturerId: row.manufacturer_id, modelCode: row.model_code,
    deviceCategory: row.device_category, integrationMethod: row.integration_method,
    protocolVersion: stringValue(row.protocol_version), certificationRef: stringValue(row.certification_ref),
    telemetryFields: JSON.stringify(row.telemetry_fields ?? [], null, 2), metadata: jsonValue(row.metadata),
  };
}

function formFromCapability(row: adapters.Capability): Partial<EditorForm> {
  return { capability: row.capability, enabled: row.enabled ? 'true' : 'false', unit: stringValue(row.unit), metadata: jsonValue(row.metadata) };
}

function formFromMapping(row: adapters.FieldMapping): Partial<EditorForm> {
  return {
    manufacturerId: stringValue(row.manufacturer_id), modelId: stringValue(row.model_id),
    sourceField: row.source_field, targetMetric: row.target_metric, dataType: row.data_type,
    unit: stringValue(row.unit), scale: stringValue(row.scale), valueOffset: stringValue(row.value_offset),
  };
}

function formFromConfig(row: adapters.IntegrationConfig): Partial<EditorForm> {
  return {
    name: row.name, manufacturerId: stringValue(row.manufacturer_id), modelId: stringValue(row.model_id),
    deviceId: stringValue(row.device_id), integrationMethod: row.integration_method,
    endpointUrl: stringValue(row.endpoint_url), authType: row.auth_type, secretRef: stringValue(row.secret_ref),
    headers: jsonValue(row.headers), rateLimitPerMinute: String(row.rate_limit_per_minute ?? 120),
    replayWindowSeconds: String(row.replay_window_seconds ?? 300), enabled: row.enabled ? 'true' : 'false',
  };
}

function buildBody(editor: Editor, form: EditorForm): Record<string, unknown> {
  switch (editor.kind) {
    case 'manufacturer':
      return {
        name: form.name, code: form.code, country: form.country, website: form.website,
        contactEmail: form.contactEmail, notes: form.notes,
      };
    case 'model':
      return {
        manufacturerId: form.manufacturerId, name: form.name, modelCode: form.modelCode,
        deviceCategory: form.deviceCategory, integrationMethod: form.integrationMethod,
        protocolVersion: form.protocolVersion, certificationRef: form.certificationRef,
        telemetryFields: parseArray(form.telemetryFields, 'Telemetry fields'),
        metadata: parseObject(form.metadata, 'Metadata'),
      };
    case 'capability':
      return {
        capability: form.capability, enabled: form.enabled === 'true', unit: form.unit,
        metadata: parseObject(form.metadata, 'Metadata'),
      };
    case 'mapping':
      return {
        manufacturerId: form.manufacturerId || undefined, modelId: form.modelId || undefined,
        sourceField: form.sourceField, targetMetric: form.targetMetric, dataType: form.dataType,
        unit: form.unit, scale: numericValue(form.scale, 'Scale'), valueOffset: numericValue(form.valueOffset, 'Value offset'),
      };
    case 'config':
      return {
        manufacturerId: form.manufacturerId || undefined, modelId: form.modelId || undefined,
        deviceId: form.deviceId || undefined, name: form.name, integrationMethod: form.integrationMethod,
        endpointUrl: form.endpointUrl, authType: form.authType, secretRef: form.secretRef,
        headers: parseObject(form.headers, 'Headers'),
        rateLimitPerMinute: numericValue(form.rateLimitPerMinute, 'Rate limit') ?? 120,
        replayWindowSeconds: numericValue(form.replayWindowSeconds, 'Replay window') ?? 300,
        enabled: form.enabled === 'true',
      };
  }
}

function statusVariant(status: string): 'success' | 'warning' | 'critical' | 'info' {
  const value = status.toLowerCase();
  if (value === 'online' || value === 'accepted' || value === 'true') return 'success';
  if (value === 'degraded' || value === 'duplicate' || value === 'connecting') return 'warning';
  if (value === 'offline' || value === 'rejected' || value === 'invalid' || value === 'unauthorized') return 'critical';
  return 'info';
}

function optionsFromManufacturers(rows: adapters.Manufacturer[] | undefined, includeAll = false): SelectOption[] {
  const options = (rows ?? []).map((row) => ({ value: row.id, label: row.name }));
  return includeAll ? [{ value: '', label: 'All manufacturers' }, ...options] : options;
}

function optionsFromModels(rows: adapters.DeviceModel[] | undefined, includeAll = false): SelectOption[] {
  const options = (rows ?? []).map((row) => ({ value: row.id, label: row.name }));
  return includeAll ? [{ value: '', label: 'All models' }, ...options] : options;
}

export default function DeviceAdaptersPage(): ReactElement {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('overview');
  const [editor, setEditor] = useState<Editor | null>(null);
  const [form, setForm] = useState<EditorForm>(EMPTY_FORM);
  const [error, setError] = useState('');
  const [filterManufacturer, setFilterManufacturer] = useState('');
  const [filterModel, setFilterModel] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('all');
  const [connectionSearch, setConnectionSearch] = useState('');
  const [auditOutcome, setAuditOutcome] = useState('');
  const [auditSource, setAuditSource] = useState('');
  const [auditLimit, setAuditLimit] = useState('50');

  const healthQ = useQuery({
    queryKey: ['device-adapters', 'health'],
    queryFn: adapters.fetchAdapterHealth,
    enabled: tab === 'overview',
  });
  const manufacturersQ = useQuery({
    queryKey: ['device-adapters', 'manufacturers'],
    queryFn: adapters.fetchManufacturers,
    enabled: tab !== 'connections' && tab !== 'audit',
  });
  const modelsQ = useQuery({
    queryKey: ['device-adapters', 'models', 'filtered', filterManufacturer],
    queryFn: () => adapters.fetchModels(filterManufacturer || undefined),
    enabled: tab === 'models',
  });
  const allModelsQ = useQuery({
    queryKey: ['device-adapters', 'models', 'all'],
    queryFn: () => adapters.fetchModels(),
    enabled: tab === 'capabilities' || tab === 'mappings' || tab === 'configs',
  });
  const capabilitiesQ = useQuery({
    queryKey: ['device-adapters', 'capabilities'],
    queryFn: adapters.fetchCapabilities,
    enabled: tab === 'capabilities',
  });
  const mappingsQ = useQuery({
    queryKey: ['device-adapters', 'mappings', filterManufacturer, filterModel],
    queryFn: () => adapters.fetchFieldMappings({
      manufacturerId: filterManufacturer || undefined,
      modelId: filterModel || undefined,
    }),
    enabled: tab === 'mappings',
  });
  const configsQ = useQuery({
    queryKey: ['device-adapters', 'configs', filterManufacturer, filterModel],
    queryFn: () => adapters.fetchIntegrationConfigs({
      manufacturerId: filterManufacturer || undefined,
      modelId: filterModel || undefined,
    }),
    enabled: tab === 'configs',
  });
  const connectionsQ = useQuery({
    queryKey: ['device-adapters', 'connections', connectionStatus, connectionSearch],
    queryFn: () => adapters.fetchConnectionStatus({
      status: connectionStatus === 'all' ? undefined : connectionStatus,
      search: connectionSearch.trim() || undefined,
    }),
    enabled: tab === 'connections' || tab === 'overview',
  });
  const auditQ = useQuery({
    queryKey: ['device-adapters', 'audit', auditOutcome, auditSource, auditLimit],
    queryFn: () => adapters.fetchIngestionAudit({
      outcome: auditOutcome || undefined,
      source: auditSource || undefined,
      limit: Number(auditLimit),
    }),
    enabled: tab === 'audit',
  });

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: ['device-adapters'] });
  };

  const saveMut = useMutation({
    mutationFn: async (next: Editor) => {
      const body = buildBody(next, form);
      if (next.kind === 'manufacturer') {
        return next.id ? adapters.updateManufacturer(next.id, body) : adapters.createManufacturer(body);
      }
      if (next.kind === 'model') {
        return next.id ? adapters.updateModel(next.id, body) : adapters.createModel(body);
      }
      if (next.kind === 'capability') {
        return next.id
          ? adapters.updateCapability(next.id, body)
          : adapters.createCapability(next.modelId ?? form.modelId, body);
      }
      if (next.kind === 'mapping') {
        return next.id ? adapters.updateFieldMapping(next.id, body) : adapters.createFieldMapping(body);
      }
      return next.id ? adapters.updateIntegrationConfig(next.id, body) : adapters.createIntegrationConfig(body);
    },
    onSuccess: () => {
      setEditor(null);
      setError('');
      invalidateAll();
    },
    onError: (cause) => setError(errorMessage(cause)),
  });

  const patchMut = useMutation<unknown, Error, { kind: EditorKind; id: string; body: Record<string, unknown> }>({
    mutationFn: ({ kind, id, body }) => {
      if (kind === 'capability') return adapters.updateCapability(id, body);
      if (kind === 'config') return adapters.updateIntegrationConfig(id, body);
      throw new Error('Unsupported quick update.');
    },
    onSuccess: invalidateAll,
    onError: (cause) => setError(errorMessage(cause)),
  });

  const deleteMut = useMutation({
    mutationFn: ({ kind, id }: { kind: EditorKind; id: string }) => {
      if (kind === 'manufacturer') return adapters.deleteManufacturer(id);
      if (kind === 'model') return adapters.deleteModel(id);
      if (kind === 'capability') return adapters.deleteCapability(id);
      if (kind === 'mapping') return adapters.deleteFieldMapping(id);
      return adapters.deleteIntegrationConfig(id);
    },
    onSuccess: invalidateAll,
    onError: (cause) => setError(errorMessage(cause)),
  });

  const openEditor = (next: Editor, initial: Partial<EditorForm> = {}) => {
    setError('');
    setForm({ ...EMPTY_FORM, ...initial });
    setEditor(next);
  };

  const confirmDelete = (kind: EditorKind, id: string, label: string) => {
    if (window.confirm(`Delete ${label}? This cannot be undone.`)) deleteMut.mutate({ kind, id });
  };

  const resetFilters = () => {
    setFilterManufacturer('');
    setFilterModel('');
    setConnectionStatus('all');
    setConnectionSearch('');
    setAuditOutcome('');
    setAuditSource('');
    setAuditLimit('50');
  };

  const filterBar = (showModel = true): ReactElement => (
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <Field label="Manufacturer">
        <Select
          aria-label="Filter by manufacturer"
          value={filterManufacturer}
          onChange={(event) => { setFilterManufacturer(event.target.value); setFilterModel(''); }}
          options={optionsFromManufacturers(manufacturersQ.data, true)}
        />
      </Field>
      {showModel ? (
        <Field label="Model">
          <Select
            aria-label="Filter by model"
            value={filterModel}
            onChange={(event) => setFilterModel(event.target.value)}
            options={optionsFromModels(allModelsQ.data, true)}
          />
        </Field>
      ) : null}
      <Button variant="ghost" size="sm" onClick={resetFilters}>Reset filters</Button>
    </div>
  );

  const table = (headers: string[], rows: ReactNode[], emptyTitle: string, emptyDescription: string): ReactElement => (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-[var(--border)] text-[11px] uppercase tracking-wide text-[var(--text-muted)]">
            <tr>{headers.map((header, index) => <th key={`${index}-${header}`} className="px-4 py-3 font-semibold">{header}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {rows.length === 0 ? (
              <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-[var(--text-muted)]">No records found.</td></tr>
            ) : rows}
          </tbody>
        </table>
      </CardContent>
      {rows.length === 0 ? <EmptyState title={emptyTitle} description={emptyDescription} /> : null}
    </Card>
  );

  const actions = (kind: EditorKind, id: string, label: string, onEdit: () => void): ReactElement => (
    <div className="flex justify-end gap-1">
      <Button variant="ghost" size="sm" aria-label={`Edit ${label}`} onClick={onEdit}><Pencil size={14} /></Button>
      <Button variant="ghost" size="sm" aria-label={`Delete ${label}`} onClick={() => confirmDelete(kind, id, label)}><Trash2 size={14} /></Button>
    </div>
  );

  const renderOverview = (): ReactElement => {
    const counts = healthQ.data?.counts;
    const listeners = healthQ.data?.listeners;
    const listenerBadge = (started: unknown): ReactElement => (
      <Badge variant={started === true ? 'success' : started === false ? 'critical' : 'warning'} dot>
        {started === true ? 'Listening' : started === false ? 'Stopped' : 'Unknown'}
      </Badge>
    );
    return (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <KpiCard label="Manufacturers" value={counts?.manufacturers ?? 0} icon={<Server size={16} />} loading={healthQ.isLoading} />
          <KpiCard label="Models" value={counts?.models ?? 0} icon={<Cpu size={16} />} loading={healthQ.isLoading} />
          <KpiCard label="Capabilities" value={counts?.capabilities ?? 0} icon={<Activity size={16} />} loading={healthQ.isLoading} />
          <KpiCard label="Field mappings" value={counts?.fieldMappings ?? 0} icon={<Activity size={16} />} loading={healthQ.isLoading} />
          <KpiCard label="Integration configs" value={counts?.integrationConfigs ?? 0} icon={<Server size={16} />} loading={healthQ.isLoading} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle as="h2">Integration methods</CardTitle></CardHeader>
            <CardContent>
              {healthQ.isLoading ? <LoadingPanel label="Loading adapter health…" /> : null}
              {(healthQ.data?.integrationMethods ?? []).length === 0 && !healthQ.isLoading ? (
                <p className="text-sm text-[var(--text-muted)]">No models are registered yet. Add a manufacturer and model to enable an integration method.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(healthQ.data?.integrationMethods ?? []).map((entry) => (
                    <Badge key={entry.method} variant="info">{entry.method}: {entry.models}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2">Protocol listeners</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3"><span>PT06 TCP listener</span>{listenerBadge(listeners?.pt06?.started)}</div>
              <div className="flex items-center justify-between gap-3"><span>PS10 TCP listener</span>{listenerBadge(listeners?.ps10?.started)}</div>
              <p className="text-xs text-[var(--text-muted)]">Listener status reflects the in-process TCP adapters. HTTP, MQTT and webhook ingestion run through their own endpoints.</p>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardHeader><CardTitle as="h2">Recent device connections</CardTitle></CardHeader>
          <CardContent className="p-0">
            {(connectionsQ.data ?? []).length === 0 ? (
              <EmptyState title="No devices yet" description="Registered devices and their connectivity state appear here." />
            ) : (
              <div className="divide-y divide-[var(--border)]">
                {(connectionsQ.data ?? []).slice(0, 8).map((row) => (
                  <div key={row.device_id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="font-semibold">{row.serial}</span>
                    <Badge variant={statusVariant(row.connectivity_status)} dot>{row.connectivity_status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderManufacturers = (): ReactElement => table(
    ['Manufacturer', 'Code', 'Country', 'Models', 'Contact', '', ''],
    (manufacturersQ.data ?? []).map((row) => [
      <span key={`${row.id}-name`} className="font-semibold">{row.name}</span>,
      <span key={`${row.id}-code`} className="font-mono text-xs">{row.code}</span>,
      <span key={`${row.id}-country`}>{row.country ?? '—'}</span>,
      <span key={`${row.id}-count`}>{row.model_count ?? 0}</span>,
      <span key={`${row.id}-contact`} className="text-[var(--text-muted)]">{row.contact_email ?? '—'}</span>,
      <span key={`${row.id}-edit`}>{actions('manufacturer', row.id, row.name, () => openEditor({ kind: 'manufacturer', id: row.id }, formFromManufacturer(row)))}</span>,
      <span key={`${row.id}-delete`} />,
    ]),
    'No manufacturers found',
    'Create a manufacturer to start building the device adapter registry.',
  );

  const renderModels = (): ReactElement => (
    <>
      {filterBar(false)}
      {table(
        ['Model', 'Manufacturer', 'Code', 'Category', 'Integration', 'Capabilities', '', ''],
        (modelsQ.data ?? []).map((row) => [
          <span key={`${row.id}-name`} className="font-semibold">{row.name}</span>,
          <span key={`${row.id}-mfr`}>{row.manufacturer_name ?? '—'}</span>,
          <span key={`${row.id}-code`} className="font-mono text-xs">{row.model_code}</span>,
          <span key={`${row.id}-cat`}><Badge variant="neutral">{row.device_category}</Badge></span>,
          <span key={`${row.id}-method`}><Badge variant="info">{row.integration_method}</Badge></span>,
          <span key={`${row.id}-caps`}>{row.capability_count ?? 0}</span>,
          <span key={`${row.id}-edit`}>{actions('model', row.id, row.name, () => openEditor({ kind: 'model', id: row.id }, formFromModel(row)))}</span>,
          <span key={`${row.id}-delete`} />,
        ]),
        'No models found',
        'Add a model to a manufacturer to define its protocol and capabilities.',
      )}
    </>
  );

  const renderCapabilities = (): ReactElement => (
    <>
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <Field label="Add capability to model">
            <Select
              aria-label="Model for new capability"
              value={form.modelId}
              onChange={(event) => setForm({ ...form, modelId: event.target.value, capability: '', enabled: 'true', unit: '' })}
              options={[{ value: '', label: 'Select a model…' }, ...optionsFromModels(allModelsQ.data)]}
            />
          </Field>
          <Button
            variant="primary"
            size="sm"
            disabled={!form.modelId}
            onClick={() => openEditor({ kind: 'capability', modelId: form.modelId }, { modelId: form.modelId, capability: '', enabled: 'true', unit: '', metadata: '{}' })}
          >
            <Plus size={14} /> Add capability
          </Button>
        </CardContent>
      </Card>
      {table(
        ['Capability', 'Model', 'Unit', 'Status', '', ''],
        (capabilitiesQ.data ?? []).map((row) => [
          <span key={`${row.id}-name`} className="font-semibold">{row.capability}</span>,
          <span key={`${row.id}-model`}>{row.model_name ?? '—'}</span>,
          <span key={`${row.id}-unit`}>{row.unit ?? '—'}</span>,
          <span key={`${row.id}-toggle`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => patchMut.mutate({ kind: 'capability', id: row.id, body: { enabled: !row.enabled } })}
            >
              <Badge variant={row.enabled ? 'success' : 'neutral'} dot>{row.enabled ? 'Enabled' : 'Disabled'}</Badge>
            </Button>
          </span>,
          <span key={`${row.id}-edit`}>{actions('capability', row.id, row.capability, () => openEditor({ kind: 'capability', id: row.id }, formFromCapability(row)))}</span>,
          <span key={`${row.id}-delete`} />,
        ]),
        'No capabilities found',
        'Select a model above to declare the telemetry features it supports.',
      )}
    </>
  );

  const renderMappings = (): ReactElement => (
    <>
      {filterBar()}
      {table(
        ['Source field', 'Target metric', 'Type', 'Unit', 'Scale', 'Offset', 'Model', '', ''],
        (mappingsQ.data ?? []).map((row) => [
          <span key={`${row.id}-source`} className="font-mono text-xs">{row.source_field}</span>,
          <span key={`${row.id}-target`} className="font-semibold">{row.target_metric}</span>,
          <span key={`${row.id}-type`}><Badge variant="neutral">{row.data_type}</Badge></span>,
          <span key={`${row.id}-unit`}>{row.unit ?? '—'}</span>,
          <span key={`${row.id}-scale`}>{row.scale ?? '1'}</span>,
          <span key={`${row.id}-offset`}>{row.value_offset ?? '0'}</span>,
          <span key={`${row.id}-model`}>{row.model_name ?? 'Global'}</span>,
          <span key={`${row.id}-edit`}>{actions('mapping', row.id, row.source_field, () => openEditor({ kind: 'mapping', id: row.id }, formFromMapping(row)))}</span>,
          <span key={`${row.id}-delete`} />,
        ]),
        'No field mappings found',
        'Map raw device fields to canonical telemetry metrics.',
      )}
    </>
  );

  const renderConfigs = (): ReactElement => (
    <>
      {filterBar()}
      {table(
        ['Name', 'Method', 'Auth', 'Endpoint', 'Rate limit', 'Status', '', ''],
        (configsQ.data ?? []).map((row) => [
          <span key={`${row.id}-name`} className="font-semibold">{row.name}</span>,
          <span key={`${row.id}-method`}><Badge variant="info">{row.integration_method}</Badge></span>,
          <span key={`${row.id}-auth`}>{row.auth_type}</span>,
          <span key={`${row.id}-url`} className="max-w-[220px] truncate font-mono text-xs" title={row.endpoint_url ?? ''}>{row.endpoint_url ?? '—'}</span>,
          <span key={`${row.id}-rate`}>{row.rate_limit_per_minute}/min</span>,
          <span key={`${row.id}-toggle`}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => patchMut.mutate({ kind: 'config', id: row.id, body: { enabled: !row.enabled } })}
            >
              <Badge variant={row.enabled ? 'success' : 'neutral'} dot>{row.enabled ? 'Enabled' : 'Disabled'}</Badge>
            </Button>
          </span>,
          <span key={`${row.id}-edit`}>{actions('config', row.id, row.name, () => openEditor({ kind: 'config', id: row.id }, formFromConfig(row)))}</span>,
          <span key={`${row.id}-delete`} />,
        ]),
        'No integration configs found',
        'Create a config to wire a device model to an ingestion endpoint.',
      )}
    </>
  );

  const renderConnections = (): ReactElement => (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Status">
          <Select aria-label="Connection status" value={connectionStatus} onChange={(event) => setConnectionStatus(event.target.value)} options={CONNECTION_STATUS_OPTIONS} />
        </Field>
        <Field label="Search">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-3 text-[var(--text-muted)]" />
            <input className={`${inputClass} pl-9`} placeholder="Device ID or IMEI" value={connectionSearch} onChange={(event) => setConnectionSearch(event.target.value)} />
          </div>
        </Field>
      </div>
      {table(
        ['Device', 'Status', 'Last message', 'Messages/hour', 'Failures', 'Last error'],
        (connectionsQ.data ?? []).map((row) => [
          <span key={`${row.device_id}-serial`} className="font-semibold">{row.serial}</span>,
          <span key={`${row.device_id}-status`}><Badge variant={statusVariant(row.connectivity_status)} dot>{row.connectivity_status}</Badge></span>,
          <span key={`${row.device_id}-last`}>{row.last_message_at ? new Date(row.last_message_at).toLocaleString() : '—'}</span>,
          <span key={`${row.device_id}-count`}>{row.messages_last_hour ?? 0}</span>,
          <span key={`${row.device_id}-failures`}>{row.consecutive_failures ?? 0}</span>,
          <span key={`${row.device_id}-error`} className="max-w-[240px] truncate text-[var(--text-muted)]" title={row.last_error ?? ''}>{row.last_error ?? '—'}</span>,
        ]),
        'No devices found',
        'Device connectivity appears here once devices are registered.',
      )}
    </>
  );

  const renderAudit = (): ReactElement => (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <Field label="Outcome">
          <Select aria-label="Audit outcome" value={auditOutcome} onChange={(event) => setAuditOutcome(event.target.value)} options={OUTCOME_OPTIONS} />
        </Field>
        <Field label="Source">
          <Select aria-label="Audit source" value={auditSource} onChange={(event) => setAuditSource(event.target.value)} options={SOURCE_OPTIONS} />
        </Field>
        <Field label="Rows">
          <Select aria-label="Audit row limit" value={auditLimit} onChange={(event) => setAuditLimit(event.target.value)} options={LIMIT_OPTIONS} />
        </Field>
      </div>
      {table(
        ['Received', 'Device', 'Source', 'Outcome', 'Reason', 'Bytes', 'Latency'],
        (auditQ.data ?? []).map((row) => [
          <span key={`${row.id}-time`}>{new Date(row.received_at).toLocaleString()}</span>,
          <span key={`${row.id}-device`} className="font-mono text-xs">{row.device_id ?? '—'}</span>,
          <span key={`${row.id}-source`}><Badge variant="neutral">{row.source}</Badge></span>,
          <span key={`${row.id}-outcome`}><Badge variant={statusVariant(row.outcome)} dot>{row.outcome}</Badge></span>,
          <span key={`${row.id}-reason`} className="max-w-[240px] truncate text-[var(--text-muted)]" title={row.reason ?? ''}>{row.reason ?? '—'}</span>,
          <span key={`${row.id}-bytes`}>{row.payload_bytes ?? '—'}</span>,
          <span key={`${row.id}-latency`}>{row.latency_ms === null ? '—' : `${row.latency_ms} ms`}</span>,
        ]),
        'No ingestion events found',
        'Ingestion outcomes appear here as devices send telemetry.',
      )}
    </>
  );

  const activeQuery =
    tab === 'overview' ? healthQ :
    tab === 'manufacturers' ? manufacturersQ :
    tab === 'models' ? modelsQ :
    tab === 'capabilities' ? capabilitiesQ :
    tab === 'mappings' ? mappingsQ :
    tab === 'configs' ? configsQ :
    tab === 'connections' ? connectionsQ : auditQ;

  const modalTitle = editor
    ? `${editor.id ? 'Edit' : 'New'} ${editor.kind === 'mapping' ? 'field mapping' : editor.kind === 'config' ? 'integration config' : editor.kind}`
    : '';

  return (
    <PageLayout
      title="Device adapters"
      description="Multi-brand device adapter registry, ingestion mappings and integration health."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" disabled={activeQuery.isFetching} onClick={() => void activeQuery.refetch()}>
            <RefreshCw size={14} className={activeQuery.isFetching ? 'animate-spin' : ''} /> Refresh
          </Button>
          {tab === 'manufacturers' ? <Button variant="primary" size="sm" onClick={() => openEditor({ kind: 'manufacturer' })}><Plus size={14} /> Manufacturer</Button> : null}
          {tab === 'models' ? <Button variant="primary" size="sm" onClick={() => openEditor({ kind: 'model' }, { manufacturerId: filterManufacturer })}><Plus size={14} /> Model</Button> : null}
          {tab === 'mappings' ? <Button variant="primary" size="sm" onClick={() => openEditor({ kind: 'mapping' }, { manufacturerId: filterManufacturer, modelId: filterModel })}><Plus size={14} /> Mapping</Button> : null}
          {tab === 'configs' ? <Button variant="primary" size="sm" onClick={() => openEditor({ kind: 'config' }, { manufacturerId: filterManufacturer, modelId: filterModel })}><Plus size={14} /> Config</Button> : null}
        </div>
      }
    >
      <div className="flex flex-wrap gap-1 border-b border-[var(--border)] pb-2">
        {TABS.map((entry) => (
          <Button
            key={entry.id}
            variant={entry.id === tab ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => { setTab(entry.id); setError(''); }}
          >
            {entry.label}
          </Button>
        ))}
      </div>

      {error ? <Card><CardContent className="p-4 text-sm text-red-600">{error}</CardContent></Card> : null}
      {activeQuery.isLoading ? <LoadingPanel label="Loading device adapters…" /> : null}

      {tab === 'overview' ? renderOverview() : null}
      {tab === 'manufacturers' ? renderManufacturers() : null}
      {tab === 'models' ? renderModels() : null}
      {tab === 'capabilities' ? renderCapabilities() : null}
      {tab === 'mappings' ? renderMappings() : null}
      {tab === 'configs' ? renderConfigs() : null}
      {tab === 'connections' ? renderConnections() : null}
      {tab === 'audit' ? renderAudit() : null}

      <EntityFormModal
        open={editor !== null}
        title={modalTitle}
        description="Changes apply to this organisation only."
        onClose={() => setEditor(null)}
        size="lg"
        testId="device-adapter-editor"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={saveMut.isPending}
              disabled={
                (editor?.kind === 'manufacturer' && (!form.name || !form.code)) ||
                (editor?.kind === 'model' && (!form.name || !form.modelCode || !form.manufacturerId)) ||
                (editor?.kind === 'capability' && !form.capability) ||
                (editor?.kind === 'mapping' && (!form.sourceField || !form.targetMetric)) ||
                (editor?.kind === 'config' && !form.name)
              }
              onClick={() => { if (editor) saveMut.mutate(editor); }}
            >
              {editor?.id ? 'Save changes' : 'Create'}
            </Button>
            <Button variant="secondary" size="sm" disabled={saveMut.isPending} onClick={() => setEditor(null)}>Cancel</Button>
            {saveMut.isError ? <span className="text-xs text-red-600">{errorMessage(saveMut.error)}</span> : null}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editor?.kind === 'manufacturer' ? (
            <>
              <Field label="Name *"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Code *"><input className={inputClass} value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></Field>
              <Field label="Country"><input className={inputClass} value={form.country} onChange={(event) => setForm({ ...form, country: event.target.value })} /></Field>
              <Field label="Website"><input className={inputClass} value={form.website} onChange={(event) => setForm({ ...form, website: event.target.value })} /></Field>
              <Field label="Contact email" wide><input className={inputClass} type="email" value={form.contactEmail} onChange={(event) => setForm({ ...form, contactEmail: event.target.value })} /></Field>
              <Field label="Notes" wide><textarea rows={3} className={`${inputClass} h-auto py-2`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
            </>
          ) : null}

          {editor?.kind === 'model' ? (
            <>
              <Field label="Manufacturer *">
                <Select aria-label="Manufacturer" value={form.manufacturerId} onChange={(event) => setForm({ ...form, manufacturerId: event.target.value })} options={optionsFromManufacturers(manufacturersQ.data)} />
              </Field>
              <Field label="Model name *"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Model code *"><input className={inputClass} value={form.modelCode} onChange={(event) => setForm({ ...form, modelCode: event.target.value })} /></Field>
              <Field label="Category">
                <Select aria-label="Device category" value={form.deviceCategory} onChange={(event) => setForm({ ...form, deviceCategory: event.target.value })} options={CATEGORY_OPTIONS} />
              </Field>
              <Field label="Integration method">
                <Select aria-label="Integration method" value={form.integrationMethod} onChange={(event) => setForm({ ...form, integrationMethod: event.target.value })} options={METHOD_OPTIONS} />
              </Field>
              <Field label="Protocol version"><input className={inputClass} value={form.protocolVersion} onChange={(event) => setForm({ ...form, protocolVersion: event.target.value })} /></Field>
              <Field label="Certification reference"><input className={inputClass} value={form.certificationRef} onChange={(event) => setForm({ ...form, certificationRef: event.target.value })} /></Field>
              <Field label="Telemetry fields (JSON array)" wide><textarea rows={3} className={`${inputClass} h-auto py-2 font-mono text-xs`} value={form.telemetryFields} onChange={(event) => setForm({ ...form, telemetryFields: event.target.value })} /></Field>
              <Field label="Metadata (JSON object)" wide><textarea rows={3} className={`${inputClass} h-auto py-2 font-mono text-xs`} value={form.metadata} onChange={(event) => setForm({ ...form, metadata: event.target.value })} /></Field>
            </>
          ) : null}

          {editor?.kind === 'capability' ? (
            <>
              <Field label="Capability *"><input className={inputClass} placeholder="ignition, fuel_level, can_bus…" value={form.capability} onChange={(event) => setForm({ ...form, capability: event.target.value })} /></Field>
              <Field label="Status">
                <Select aria-label="Capability status" value={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.value })} options={BOOLEAN_OPTIONS} />
              </Field>
              <Field label="Unit"><input className={inputClass} placeholder="e.g. litres" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field>
              <Field label="Metadata (JSON object)"><textarea rows={3} className={`${inputClass} h-auto py-2 font-mono text-xs`} value={form.metadata} onChange={(event) => setForm({ ...form, metadata: event.target.value })} /></Field>
            </>
          ) : null}

          {editor?.kind === 'mapping' ? (
            <>
              <Field label="Manufacturer">
                <Select aria-label="Manufacturer" value={form.manufacturerId} onChange={(event) => setForm({ ...form, manufacturerId: event.target.value })} options={[{ value: '', label: 'Global mapping' }, ...optionsFromManufacturers(manufacturersQ.data)]} />
              </Field>
              <Field label="Model">
                <Select aria-label="Model" value={form.modelId} onChange={(event) => setForm({ ...form, modelId: event.target.value })} options={[{ value: '', label: 'All models' }, ...optionsFromModels(allModelsQ.data)]} />
              </Field>
              <Field label="Source field *"><input className={inputClass} placeholder="e.g. io7 or can.fuel" value={form.sourceField} onChange={(event) => setForm({ ...form, sourceField: event.target.value })} /></Field>
              <Field label="Target metric *"><input className={inputClass} placeholder="e.g. fuel_level" value={form.targetMetric} onChange={(event) => setForm({ ...form, targetMetric: event.target.value })} /></Field>
              <Field label="Data type">
                <Select aria-label="Data type" value={form.dataType} onChange={(event) => setForm({ ...form, dataType: event.target.value })} options={DATA_TYPE_OPTIONS} />
              </Field>
              <Field label="Unit"><input className={inputClass} value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} /></Field>
              <Field label="Scale"><input className={inputClass} inputMode="decimal" value={form.scale} onChange={(event) => setForm({ ...form, scale: event.target.value })} /></Field>
              <Field label="Value offset"><input className={inputClass} inputMode="decimal" value={form.valueOffset} onChange={(event) => setForm({ ...form, valueOffset: event.target.value })} /></Field>
            </>
          ) : null}

          {editor?.kind === 'config' ? (
            <>
              <Field label="Name *"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
              <Field label="Integration method">
                <Select aria-label="Integration method" value={form.integrationMethod} onChange={(event) => setForm({ ...form, integrationMethod: event.target.value })} options={METHOD_OPTIONS} />
              </Field>
              <Field label="Manufacturer">
                <Select aria-label="Manufacturer" value={form.manufacturerId} onChange={(event) => setForm({ ...form, manufacturerId: event.target.value })} options={[{ value: '', label: 'Global config' }, ...optionsFromManufacturers(manufacturersQ.data)]} />
              </Field>
              <Field label="Model">
                <Select aria-label="Model" value={form.modelId} onChange={(event) => setForm({ ...form, modelId: event.target.value })} options={[{ value: '', label: 'All models' }, ...optionsFromModels(allModelsQ.data)]} />
              </Field>
              <Field label="Device ID"><input className={inputClass} value={form.deviceId} onChange={(event) => setForm({ ...form, deviceId: event.target.value })} /></Field>
              <Field label="Auth type">
                <Select aria-label="Auth type" value={form.authType} onChange={(event) => setForm({ ...form, authType: event.target.value })} options={AUTH_TYPE_OPTIONS} />
              </Field>
              <Field label="Endpoint URL" wide><input className={inputClass} value={form.endpointUrl} onChange={(event) => setForm({ ...form, endpointUrl: event.target.value })} /></Field>
              <Field label="Secret reference"><input className={inputClass} placeholder="Vault or env key" value={form.secretRef} onChange={(event) => setForm({ ...form, secretRef: event.target.value })} /></Field>
              <Field label="Status">
                <Select aria-label="Config status" value={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.value })} options={BOOLEAN_OPTIONS} />
              </Field>
              <Field label="Rate limit / minute"><input className={inputClass} inputMode="numeric" value={form.rateLimitPerMinute} onChange={(event) => setForm({ ...form, rateLimitPerMinute: event.target.value })} /></Field>
              <Field label="Replay window (seconds)"><input className={inputClass} inputMode="numeric" value={form.replayWindowSeconds} onChange={(event) => setForm({ ...form, replayWindowSeconds: event.target.value })} /></Field>
              <Field label="Headers (JSON object)" wide><textarea rows={3} className={`${inputClass} h-auto py-2 font-mono text-xs`} value={form.headers} onChange={(event) => setForm({ ...form, headers: event.target.value })} /></Field>
            </>
          ) : null}
        </div>
      </EntityFormModal>
    </PageLayout>
  );
}
