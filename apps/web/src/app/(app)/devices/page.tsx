'use client';

import { type ReactElement, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, Plus, RefreshCw, Search, Server, Wifi, WifiOff, Wrench, Power, PowerOff } from 'lucide-react';
import { Badge, Button, Card, CardContent, EmptyState, KpiCard, LoadingPanel, PageLayout, Select } from '@geoventra/ui';
import { assignDevice, createDevice, deleteDevice, fetchDevices, setDeviceStatus, unassignDevice, updateDevice, type DeviceRecord } from '@/lib/devices-api';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All statuses' },
  { value: 'online', label: 'Online' },
  { value: 'offline', label: 'Offline' },
  { value: 'degraded', label: 'Degraded' },
  { value: 'unassigned', label: 'Unassigned' },
];

function statusVariant(s: string) {
  if (s === 'online') return 'success';
  if (s === 'degraded') return 'warning';
  if (s === 'offline') return 'critical';
  return 'neutral';
}

export default function DevicesPage(): ReactElement {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('active');
  const [page, setPage] = useState(1);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ deviceId: '', deviceType: 'gps_tracker', model: '', provider: '', imei: '', serialNumber: '', firmwareVersion: '', status: 'unassigned' });
  const [assign, setAssign] = useState<Record<string, string>>({});

  const query = useQuery({
    queryKey: ['devices', search, status, activeFilter, page],
    queryFn: () => fetchDevices({ search: search || undefined, status: status === 'all' ? undefined : status, active: activeFilter, page, pageSize: 25 }),
  });

  const createMut = useMutation({
    mutationFn: () => createDevice({ ...form, deviceId: form.deviceId || form.serialNumber || `DEV-${Date.now()}` }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); setShowForm(false); setForm({ deviceId: '', deviceType: 'gps_tracker', model: '', provider: '', imei: '', serialNumber: '', firmwareVersion: '', status: 'unassigned' }); },
  });
  const updateMut = useMutation({ mutationFn: ({ id, body }: { id: string; body: any }) => updateDevice(id, body), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) });
  const statusMut = useMutation({ mutationFn: ({ id, activeFlag }: { id: string; activeFlag: boolean }) => setDeviceStatus(id, activeFlag), onSuccess: () => { qc.invalidateQueries({ queryKey: ['devices'] }); qc.invalidateQueries({ queryKey: ['engine-overview'] }); qc.invalidateQueries({ queryKey: ['engine-telemetry-latest'] }); qc.invalidateQueries({ queryKey: ['tpms-vehicle'] }); qc.invalidateQueries({ queryKey: ['tracking-snapshot'] }); } });
  const deleteMut = useMutation({ mutationFn: (id: string) => deleteDevice(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) });
  const assignMut = useMutation({ mutationFn: ({ id, vehicleId }: { id: string; vehicleId: string }) => assignDevice(id, { vehicleId }), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) });
  const unassignMut = useMutation({ mutationFn: (id: string) => unassignDevice(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }) });

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
            <Button variant="secondary" size="sm" onClick={() => query.refetch()}><RefreshCw size={14} /> Refresh</Button>
            <Button variant="primary" size="sm" onClick={() => setShowForm((v) => !v)}><Plus size={14} /> Register device</Button>
          </div>
        </CardContent>
      </Card>

      {showForm ? (
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Device ID / IMEI" value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Model" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Provider / Manufacturer" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Serial number" value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })} />
            <input className="h-9 rounded-lg border border-[var(--border)] bg-[var(--bg-app)] px-3 text-sm" placeholder="Firmware version" value={form.firmwareVersion} onChange={(e) => setForm({ ...form, firmwareVersion: e.target.value })} />
            <Select aria-label="Device type" value={form.deviceType} onChange={(e) => setForm({ ...form, deviceType: e.target.value })} options={[{ value: 'gps_tracker', label: 'GPS Tracker' }, { value: 'obd_dongle', label: 'OBD Dongle' }, { value: 'asset_tag', label: 'Asset Tag' }]} />
            <div className="md:col-span-3 flex gap-2">
              <Button variant="primary" size="sm" disabled={createMut.isPending || !form.model || !form.provider} onClick={() => createMut.mutate()}>{createMut.isPending ? 'Saving…' : 'Create device'}</Button>
              <Button variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              {createMut.isError ? <span className="text-sm text-red-600">Failed to create device.</span> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {query.isLoading ? <LoadingPanel label="Loading devices…" /> : null}
      {query.isError ? <Card><CardContent className="p-4 text-sm text-red-600">Failed to load devices. Check API connectivity and permissions.</CardContent></Card> : null}
      {!query.isLoading && devices.length === 0 ? (
        <EmptyState title="No devices found" description="Register a device to start tracking vehicles and ingesting telemetry." icon={<Cpu size={28} />} action={<Button variant="primary" size="sm" onClick={() => setShowForm(true)}><Plus size={14} /> Register device</Button>} />
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
                      </td>
                      <td className="px-4 py-3"><Badge variant={statusVariant(d.status) as any} dot>{d.status}</Badge></td>
                      <td className="px-4 py-3"><Badge variant={d.activeFlag ? 'success' : 'neutral'}>{d.activeFlag ? 'Active' : 'Inactive'}</Badge></td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{d.lastCommunicationAt ? new Date(d.lastCommunicationAt).toLocaleString() : '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <input value={assign[d.id] ?? ''} onChange={(e) => setAssign((p) => ({ ...p, [d.id]: e.target.value }))} placeholder="Vehicle ID" className="h-8 w-36 rounded-md border border-[var(--border)] bg-[var(--bg-app)] px-2 text-xs" />
                          <Button variant="secondary" size="sm" disabled={!assign[d.id] || assignMut.isPending} onClick={() => assignMut.mutate({ id: d.id, vehicleId: assign[d.id]! })}>Assign</Button>
                          <Button variant="secondary" size="sm" disabled={unassignMut.isPending} onClick={() => unassignMut.mutate(d.id)}>Unassign</Button>
                          {d.activeFlag ? (
                            <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={() => { if (confirm('Disable this device?')) statusMut.mutate({ id: d.id, activeFlag: false }); }}><PowerOff size={12} /> Disable</Button>
                          ) : (
                            <Button variant="secondary" size="sm" disabled={statusMut.isPending} onClick={() => statusMut.mutate({ id: d.id, activeFlag: true })}><Power size={12} /> Enable</Button>
                          )}
                          <Button variant="secondary" size="sm" disabled={updateMut.isPending} onClick={() => updateMut.mutate({ id: d.id, body: { status: d.status === 'online' ? 'offline' : 'online' } })}><Wrench size={12} /> Toggle</Button>
                          <Button variant="danger" size="sm" disabled={deleteMut.isPending} onClick={() => { if (confirm('Remove this device?')) deleteMut.mutate(d.id); }}>Delete</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <span>{meta?.total ?? devices.length} devices</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {meta?.page ?? page} / {meta?.totalPages ?? 1}</span>
                <Button variant="secondary" size="sm" disabled={(meta?.page ?? page) >= (meta?.totalPages ?? 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </PageLayout>
  );
}
