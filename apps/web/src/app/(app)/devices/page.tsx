'use client';

import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, Pencil, Plus, RefreshCw, Search, Server, Wifi, WifiOff, Wrench, Power, PowerOff } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, KpiCard, LoadingPanel, PageLayout, Pagination, Select } from '@geoventra/ui';
import { assignDevice, createDevice, deleteDevice, fetchDevice, fetchDevices, setDeviceStatus, unassignDevice, updateDevice, type DeviceRecord } from '@/lib/devices-api';
import { invalidateDevices } from '@/lib/invalidate';
import { fetchVehicles } from '@/lib/vehicles-api';
import { EntityFormModal } from '@/components/ui/EntityFormModal';
import { useDebouncedValue } from '@/lib/useDebouncedValue';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unassigned', label: 'Unassigned' },
];

const PROTOCOL_OPTIONS = ['Teltonika Codec', 'Queclink', 'GT06', 'Meitrack', 'Generic ASCII', 'MQTT JSON'];
const CONNECTION_OPTIONS = [
  { value: 'tcp', label: 'TCP' },
  { value: 'mqtt', label: 'MQTT' },
  { value: 'api', label: 'HTTP API' },
  { value: 'webhook', label: 'Webhook' },
];
const DEVICE_TYPE_OPTIONS = [
  { value: 'gps_tracker', label: 'GPS Tracker' },
  { value: 'obd_dongle', label: 'OBD Dongle' },
  { value: 'asset_tag', label: 'Asset Tag' },
];
const DEVICE_STATUS_FORM_OPTIONS = [
  { value: 'unassigned', label: 'Unassigned — simulated until connected' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'degraded', label: 'Degraded' },
];

const EMPTY_DEVICE_FORM = {
  deviceId: '',
  deviceType: 'gps_tracker',
  imei: '',
  model: '',
  provider: '',
  protocol: 'Teltonika Codec',
  connectionMethod: 'tcp',
  serverAddress: '',
  serialNumber: '',
  firmwareVersion: '',
  status: 'unassigned',
  macAddress: '',
  installationDate: '',
  installedAtLocation: '',
  warrantyExpiresAt: '',
  lastFirmwareAt: '',
  integrationMethod: '',
  connectionConfig: '',
  metadata: '',
};

type DeviceForm = typeof EMPTY_DEVICE_FORM;
type DeviceEditor = { mode: 'create' } | { mode: 'edit'; id: string; deviceId: string; activeFlag: boolean };

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--text-secondary)]">
      <span>{label}</span>
      {children}
    </label>
  );
}

const inputClass = 'h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]';

function statusVariant(s: string) {
  if (s === 'online') return 'success';
  if (s === 'degraded') return 'warning';
  if (s === 'offline') return 'critical';
  return 'neutral';
}

function dateValue(value: unknown): string {
  return value ? String(value).slice(0, 10) : '';
}

function dateTimeValue(value: unknown): string {
  if (!value) return '';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return '';
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function jsonValue(value: unknown): string {
  return value && typeof value === 'object' ? JSON.stringify(value, null, 2) : '';
}

function parseJSONObject(text: string, label: string): Record<string, unknown> | undefined {
  if (!text.trim()) return undefined;
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

function formFromDevice(d: DeviceRecord): DeviceForm {
  return {
    deviceId: d.deviceId ?? '',
    deviceType: d.deviceType ?? 'gps_tracker',
    imei: d.imei ?? '',
    model: d.model ?? '',
    provider: d.provider ?? '',
    protocol: d.protocol ?? '',
    connectionMethod: d.connectionMethod ?? 'tcp',
    serverAddress: d.serverAddress ?? '',
    serialNumber: d.serialNumber ?? '',
    firmwareVersion: d.firmwareVersion ?? '',
    status: d.status ?? 'unassigned',
    macAddress: d.macAddress ?? '',
    installationDate: dateValue(d.installationDate),
    installedAtLocation: d.installedAtLocation ?? '',
    warrantyExpiresAt: dateValue(d.warrantyExpiresAt),
    lastFirmwareAt: dateTimeValue(d.lastFirmwareAt),
    integrationMethod: d.integrationMethod ?? 'API',
    connectionConfig: jsonValue(d.connectionConfig),
    metadata: jsonValue(d.metadata),
  };
}

export default function DevicesPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [editor, setEditor] = useState<DeviceEditor | null>(null);
  const [editLoadingId, setEditLoadingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<DeviceForm>({ ...EMPTY_DEVICE_FORM });
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [actionFeedback, setActionFeedback] = useState<Record<string, string>>({});

  const debouncedSearch = useDebouncedValue(search);
  const query = useQuery({
    queryKey: ['devices', debouncedSearch, status, activeFilter, page, pageSize],
    queryFn: () => fetchDevices({ search: debouncedSearch || undefined, status: status === 'all' ? undefined : status, active: activeFilter, page, pageSize }),
  });

  function closeEditor() {
    setEditor(null);
  }

  function openCreate() {
    setForm({ ...EMPTY_DEVICE_FORM });
    setEditor({ mode: 'create' });
  }

  async function beginEdit(device: DeviceRecord) {
    setEditLoadingId(device.id);
    // Load the full record before opening so location, integration and JSON
    // settings are prefilled instead of appearing blank.
    let detail = device;
    try {
      detail = await fetchDevice(device.id);
    } catch {
      // Fall back to the list row if the detail lookup fails.
    } finally {
      setEditLoadingId(null);
    }
    setForm(formFromDevice(detail));
    setEditor({ mode: 'edit', id: device.id, deviceId: detail.deviceId || device.deviceId || device.id, activeFlag: Boolean(detail.activeFlag ?? device.activeFlag) });
  }

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        deviceType: form.deviceType,
        imei: form.imei,
        model: form.model,
        firmwareVersion: form.firmwareVersion,
        provider: form.provider,
        protocol: form.protocol,
        serverAddress: form.serverAddress,
        connectionMethod: form.connectionMethod,
        serialNumber: form.serialNumber,
        macAddress: form.macAddress,
        status: form.status,
        installedAtLocation: form.installedAtLocation,
      };
      if (form.integrationMethod) payload.integrationMethod = form.integrationMethod;
      if (form.installationDate) payload.installationDate = form.installationDate;
      if (form.warrantyExpiresAt) payload.warrantyExpiresAt = form.warrantyExpiresAt;
      if (form.lastFirmwareAt) {
        const timestamp = new Date(form.lastFirmwareAt);
        if (!Number.isNaN(timestamp.getTime())) payload.lastFirmwareAt = timestamp.toISOString();
      }
      const connectionConfig = parseJSONObject(form.connectionConfig, 'Connection config');
      if (connectionConfig) payload.connectionConfig = connectionConfig;
      const metadata = parseJSONObject(form.metadata, 'Metadata');
      if (metadata) payload.metadata = metadata;
      if (editor?.mode === 'edit') {
        // Device ID is immutable; the update schema rejects unknown keys.
        // Model, provider and type must be non-empty when supplied.
        if (!payload.model) delete payload.model;
        if (!payload.provider) delete payload.provider;
        if (!payload.deviceType) delete payload.deviceType;
        return updateDevice(editor.id, payload);
      }
      return createDevice({ ...payload, deviceId: form.deviceId || form.serialNumber || `DEV-${Date.now()}` });
    },
    onSuccess: () => { invalidateDevices(qc); closeEditor(); },
  });
  const toggleMut = useMutation({ mutationFn: ({ id, body }: { id: string; body: any }) => updateDevice(id, body), onSuccess: () => invalidateDevices(qc) });
  const statusMut = useMutation({
    mutationFn: ({ id, activeFlag }: { id: string; activeFlag: boolean }) => setDeviceStatus(id, activeFlag),
    onSuccess: (_data, vars) => { invalidateDevices(qc); setActiveFilter(vars.activeFlag ? 'active' : 'inactive'); },
  });
  const deleteMut = useMutation({ mutationFn: (id: string) => deleteDevice(id), onSuccess: () => { invalidateDevices(qc); setConfirmDeleteId(null); } });
  const assignMut = useMutation({
    mutationFn: ({ id, vehicleId }: { id: string; vehicleId: string }) => assignDevice(id, { vehicleId }),
    onSuccess: (_data, vars) => {
      invalidateDevices(qc);
      setAssign((prev) => ({ ...prev, [vars.id]: vars.vehicleId }));
      setActionFeedback((prev) => ({ ...prev, [vars.id]: 'Vehicle assigned.' }));
    },
  });
  const unassignMut = useMutation({
    mutationFn: (id: string) => unassignDevice(id),
    onSuccess: (_data, id) => {
      invalidateDevices(qc);
      setAssign((prev) => ({ ...prev, [id]: '' }));
      setActionFeedback((prev) => ({ ...prev, [id]: 'Vehicle unassigned.' }));
    },
  });

  const vehiclesQuery = useQuery({ queryKey: ['vehicles', 'device-assign'], queryFn: () => fetchVehicles({ active: 'all', pageSize: 100 }) });
  const vehicleOptions = [
    { value: '', label: 'Select vehicle…', disabled: false },
    ...(vehiclesQuery.data?.data ?? []).map((v) => ({
      value: v.id,
      label: `${v.registrationNumber} · ${v.name}${v.activeFlag ? '' : ' (inactive)'}`,
      disabled: !v.activeFlag,
    })),
  ];

  const devices = query.data?.data ?? [];
  const meta = query.data?.meta as any;
  const stats = useMemo(() => {
    const all = devices;
    return {
      total: meta?.total ?? all.length,
      online: all.filter((d) => d.status === 'online').length,
      offline: all.filter((d) => d.status === 'offline').length,
      unassigned: all.filter((d) => d.status === 'unassigned').length,
    };
  }, [devices, meta]);

  return (
    <PageLayout
      title="Devices"
      description="Manage GPS trackers, OBD devices and asset sensors. Register devices, track connectivity, and assign them to vehicles."
      breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Operations' }, { label: 'Devices' }]}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={<Cpu size={18} />} label="Devices" value={String(stats.total)} unit="in registry" />
        <KpiCard icon={<Wifi size={18} />} label="Online" value={String(stats.online)} unit="reporting" tone="positive" />
        <KpiCard icon={<WifiOff size={18} />} label="Offline" value={String(stats.offline)} unit="needs attention" tone={stats.offline ? 'warning' : 'neutral'} />
        <KpiCard icon={<Server size={18} />} label="Unassigned" value={String(stats.unassigned)} unit="available" />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <div className="relative max-w-md flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search device ID, IMEI, model…" className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--bg-app)] pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]" />
            </div>
            <Select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} options={STATUS_OPTIONS} />
            <Select aria-label="Active filter" value={activeFilter} onChange={(e) => { setActiveFilter(e.target.value as any); setPage(1); }} options={[{ value: 'all', label: 'All active states' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} />
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}><RefreshCw size={14} className={query.isFetching ? 'animate-spin' : ''} /> Refresh</Button>
            <Button variant="primary" size="sm" onClick={openCreate}><Plus size={14} /> Register device</Button>
          </div>
        </CardContent>
      </Card>

      <EntityFormModal
        open={editor !== null}
        title={editor?.mode === 'edit' ? 'Edit device' : 'Register device'}
        description={editor?.mode === 'edit' ? `Update configuration for ${editor.deviceId}.` : 'Add a GPS tracker, OBD device or asset sensor to the registry.'}
        onClose={closeEditor}
        size="lg"
        testId="device-editor"
        footer={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              disabled={saveMut.isPending || !form.provider || (editor?.mode === 'create' && !form.deviceId)}
              loading={saveMut.isPending}
              onClick={() => saveMut.mutate()}
            >
              {editor?.mode === 'edit' ? 'Save changes' : 'Create device'}
            </Button>
            <Button variant="secondary" size="sm" disabled={saveMut.isPending} onClick={closeEditor}>Cancel</Button>
            {editor?.mode === 'create' ? <span className="text-xs text-[var(--text-muted)]">New devices stay simulated until the first packet arrives.</span> : null}
            {saveMut.isError ? <span className="text-xs text-red-600">{(saveMut.error as any)?.message || 'Failed to save device.'}</span> : null}
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {editor?.mode === 'edit' ? (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 py-2 text-xs text-[var(--text-secondary)] sm:col-span-2 lg:col-span-3">
              <div>Device ID <span className="font-semibold text-[var(--text-primary)]">{editor.deviceId}</span> is immutable and cannot be changed.</div>
              <div className="mt-1">Active status: <span className="font-semibold text-[var(--text-primary)]">{editor.activeFlag ? 'Active' : 'Inactive'}</span> — use the Enable/Disable actions to change it.</div>
            </div>
          ) : (
            <Field label="Device ID *">
              <input className={inputClass} placeholder="GV-DEV-0001" value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} />
            </Field>
          )}
          <Field label="Manufacturer *">
            <input className={inputClass} placeholder="Teltonika" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
          </Field>
          <Field label="Model">
            <input className={inputClass} placeholder="FMB920" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
          </Field>
          <Field label="Device type">
            <Select aria-label="Device type" value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} options={DEVICE_TYPE_OPTIONS} />
          </Field>
          <Field label="IMEI">
            <input className={inputClass} placeholder="356938035643809" value={form.imei} onChange={(e) => setForm({ ...form, imei: e.target.value })} />
          </Field>
          <Field label="Serial number">
            <input className={inputClass} placeholder="Serial number" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
          </Field>
          <Field label="MAC address">
            <input className={inputClass} placeholder="00:1A:2B:3C:4D:5E" value={form.macAddress} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} />
          </Field>
          <Field label="Protocol">
            <input className={inputClass} list="device-protocols" placeholder="Teltonika Codec" value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} />
            <datalist id="device-protocols">
              {PROTOCOL_OPTIONS.map((p) => <option key={p} value={p} />)}
            </datalist>
          </Field>
          <Field label="Connection">
            <Select aria-label="Connection" value={form.connectionMethod} onChange={(e) => setForm({ ...form, connectionMethod: e.target.value })} options={CONNECTION_OPTIONS} />
          </Field>
          <Field label="Server">
            <input className={inputClass} placeholder="Your Geoventra TCP listener (host:port)" value={form.serverAddress} onChange={(e) => setForm({ ...form, serverAddress: e.target.value })} />
          </Field>
          <Field label="Firmware version">
            <input className={inputClass} placeholder="1.0.0" value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} />
          </Field>
          <Field label="Status">
            <Select aria-label="Status" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} options={DEVICE_STATUS_FORM_OPTIONS} />
          </Field>
          <Field label="Installation date">
            <input type="date" className={inputClass} value={form.installationDate} onChange={(e) => setForm({ ...form, installationDate: e.target.value })} />
          </Field>
          <Field label="Warranty expires">
            <input type="date" className={inputClass} value={form.warrantyExpiresAt} onChange={(e) => setForm({ ...form, warrantyExpiresAt: e.target.value })} />
          </Field>
          <Field label="Installed at location">
            <input className={inputClass} placeholder="Where the device is installed" value={form.installedAtLocation} onChange={(e) => setForm({ ...form, installedAtLocation: e.target.value })} />
          </Field>
          <Field label="Last firmware update">
            <input type="datetime-local" className={inputClass} value={form.lastFirmwareAt} onChange={(e) => setForm({ ...form, lastFirmwareAt: e.target.value })} />
          </Field>
          <Field label="Integration method">
            <Select aria-label="Integration method" value={form.integrationMethod} onChange={(e) => setForm({ ...form, integrationMethod: e.target.value })} options={[{ value: '', label: 'Inherit from connection' }, { value: 'API', label: 'API' }, { value: 'TCP', label: 'TCP' }, { value: 'MQTT', label: 'MQTT' }, { value: 'WEBHOOK', label: 'Webhook' }]} />
          </Field>
          <Field label="Connection config (JSON)">
            <textarea rows={3} className={`${inputClass} h-auto py-2 font-mono text-xs`} placeholder="{}" value={form.connectionConfig} onChange={(e) => setForm({ ...form, connectionConfig: e.target.value })} />
          </Field>
          <Field label="Metadata (JSON)">
            <textarea rows={3} className={`${inputClass} h-auto py-2 font-mono text-xs`} placeholder="{}" value={form.metadata} onChange={(e) => setForm({ ...form, metadata: e.target.value })} />
          </Field>
        </div>
      </EntityFormModal>

      {(query.error || deleteMut.isError || statusMut.isError || toggleMut.isError || saveMut.isError || assignMut.isError || unassignMut.isError) ? (
        <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm text-red-600">
          <span>{((query.error || deleteMut.error || statusMut.error || toggleMut.error || saveMut.error || assignMut.error || unassignMut.error) as any)?.message || 'Device action failed.'}</span>
          {query.error ? <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>Retry</Button> : null}
        </CardContent></Card>
      ) : null}
      {query.isLoading ? <LoadingPanel label="Loading devices…" /> : null}
      {!query.isLoading && devices.length === 0 ? (
        <EmptyState title="No devices found" description="Register a device to start tracking vehicles and ingesting telemetry." icon={<Cpu size={28} />} action={<Button variant="primary" size="sm" onClick={openCreate}><Plus size={14} /> Register device</Button>} />
      ) : null}

      {devices.length > 0 ? (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-[var(--bg-app)] text-left text-xs uppercase tracking-wide text-[var(--text-muted)]">
                  <tr>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Provider / Model</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Assigned vehicle</th>
                    <th className="px-4 py-3">Active</th>
                    <th className="px-4 py-3">Last communication</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {devices.map((d: DeviceRecord) => (
                    <tr key={d.id} className="border-t border-[var(--border)]">
                      <td className="px-4 py-3">
                        <div className="font-medium text-[var(--text-primary)]">{d.deviceId || d.id}</div>
                        <div className="text-xs text-[var(--text-muted)]">{d.imei || d.serialNumber || 'No IMEI/serial'}</div>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{d.deviceType}</td>
                      <td className="px-4 py-3">
                        <div className="text-[var(--text-primary)]">{d.model}</div>
                        <div className="text-xs text-[var(--text-muted)]">{d.provider} {d.firmwareVersion ? `· FW ${d.firmwareVersion}` : ''}</div>
                        {(d.protocol || d.serverAddress) ? <div className="text-xs text-[var(--text-muted)]">{[d.protocol, d.connectionMethod?.toUpperCase(), d.serverAddress].filter(Boolean).join(' · ')}</div> : null}
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(d.status) as any} dot>{d.status}</Badge></td>
                      <td className="px-4 py-3">
                        {d.vehicleRegistration ? (
                          <Badge variant="success">{d.vehicleRegistration}</Badge>
                        ) : (
                          <span className="text-[var(--text-muted)]">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><Badge variant={d.activeFlag ? 'success' : 'neutral'}>{d.activeFlag ? 'Active' : 'Inactive'}</Badge></td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{d.lastCommunicationAt ? new Date(d.lastCommunicationAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link href={`/devices/${encodeURIComponent(d.id)}`}><Button variant="secondary" size="sm"><Cpu size={12} /> View</Button></Link>
                            <Button variant="secondary" size="sm" disabled={editLoadingId === d.id} loading={editLoadingId === d.id} onClick={() => void beginEdit(d)}><Pencil size={12} /> {editLoadingId === d.id ? 'Loading…' : 'Edit'}</Button>
                            <select aria-label={`Assign vehicle for ${d.deviceId ?? d.id}`} value={assign[d.id] ?? d.vehicleId ?? ''} onChange={(e) => { setAssign((p) => ({ ...p, [d.id]: e.target.value })); setActionFeedback((p) => ({ ...p, [d.id]: '' })); }} className="h-8 w-48 rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 text-xs">
                              {vehicleOptions.map((option) => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
                            </select>
                            <Button variant="secondary" size="sm" disabled={!assign[d.id] || !d.activeFlag || assignMut.isPending} loading={assignMut.variables?.id === d.id && assignMut.isPending} onClick={() => assignMut.mutate({ id: d.id, vehicleId: assign[d.id]! })}>Assign</Button>
                            <Button variant="secondary" size="sm" disabled={!d.vehicleId || unassignMut.isPending} loading={unassignMut.variables === d.id && unassignMut.isPending} onClick={() => unassignMut.mutate(d.id)}>Unassign</Button>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {d.activeFlag ? (
                              <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: d.id, activeFlag: false })}><PowerOff size={12} /> Disable</Button>
                            ) : (
                              <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: d.id, activeFlag: true })}><Power size={12} /> Enable</Button>
                            )}
                            <Button variant="secondary" size="sm" disabled={toggleMut.isPending} onClick={() => toggleMut.mutate({ id: d.id, body: { status: d.status === 'online' ? 'offline' : 'online' } })}><Wrench size={12} /> Toggle</Button>
                            {confirmDeleteId === d.id ? (
                              <>
                                <Button variant="danger" size="sm" disabled={deleteMut.isPending} onClick={() => deleteMut.mutate(d.id)}>Confirm delete</Button>
                                <Button variant="secondary" size="sm" disabled={deleteMut.isPending} onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                              </>
                            ) : (
                              <Button variant="danger" size="sm" disabled={deleteMut.isPending} onClick={() => setConfirmDeleteId(d.id)}>Delete</Button>
                            )}
                          </div>
                          {!d.activeFlag ? <div className="text-xs text-[var(--text-muted)]">Enable this device before assigning a vehicle.</div> : null}
                          {actionFeedback[d.id] ? <div className="text-xs font-medium text-emerald-600" role="status">{actionFeedback[d.id]}</div> : null}
                          {(() => {
                            const error = assignMut.isError && assignMut.variables?.id === d.id
                              ? assignMut.error
                              : unassignMut.isError && unassignMut.variables === d.id
                                ? unassignMut.error
                                : null;
                            return error ? (
                              <div className="text-xs font-medium text-red-600" role="alert">
                                {(error as Error)?.message || 'Assignment failed.'}
                              </div>
                            ) : null;
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meta ? (
              <Pagination
                className="border-t border-[var(--border)] px-4 py-3"
                page={meta.page}
                pageSize={meta.pageSize}
                total={meta.total}
                totalPages={meta.totalPages}
                itemLabel="devices"
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </PageLayout>
  );
}
