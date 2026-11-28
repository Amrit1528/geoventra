'use client';

import { type ReactElement, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Battery, Cpu, Radio, Shield, Wrench } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, LoadingPanel, PageLayout } from '@geoventra/ui';
import {
  fetchDevice,
  fetchDeviceAlarms,
  fetchDeviceBattery,
  fetchDeviceCapabilities,
  fetchDeviceCommands,
  fetchDeviceConfiguration,
  fetchDeviceEvents,
  fetchDeviceFirmware,
  fetchDeviceHealth,
  fetchDeviceSensors,
  fetchDeviceTelemetry,
} from '@/lib/devices-api';

type Tab = 'overview' | 'config' | 'commands' | 'telemetry' | 'capabilities' | 'battery' | 'sensors' | 'events';

export default function DeviceDetailPage(): ReactElement {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [tab, setTab] = useState<Tab>('overview');

  const deviceQuery = useQuery({ queryKey: ['device', id], queryFn: () => fetchDevice(id), enabled: Boolean(id) });
  const configQuery = useQuery({ queryKey: ['device-config', id], queryFn: () => fetchDeviceConfiguration(id), enabled: Boolean(id) && tab === 'config' });
  const commandsQuery = useQuery({ queryKey: ['device-commands', id], queryFn: () => fetchDeviceCommands(id), enabled: Boolean(id) && tab === 'commands' });
  const telemetryQuery = useQuery({ queryKey: ['device-telemetry', id], queryFn: () => fetchDeviceTelemetry(id), enabled: Boolean(id) && tab === 'telemetry' });
  const capabilitiesQuery = useQuery({ queryKey: ['device-capabilities', id], queryFn: () => fetchDeviceCapabilities(id), enabled: Boolean(id) && tab === 'capabilities' });
  const alarmsQuery = useQuery({ queryKey: ['device-alarms', id], queryFn: () => fetchDeviceAlarms(id), enabled: Boolean(id) && tab === 'overview' });
  const firmwareQuery = useQuery({ queryKey: ['device-firmware', id], queryFn: () => fetchDeviceFirmware(id), enabled: Boolean(id) && tab === 'overview' });
  const healthQuery = useQuery({ queryKey: ['device-health', id], queryFn: () => fetchDeviceHealth(id), enabled: Boolean(id) && tab === 'overview' });
  const batteryQuery = useQuery({ queryKey: ['device-battery', id], queryFn: () => fetchDeviceBattery(id), enabled: Boolean(id) && tab === 'battery' });
  const sensorsQuery = useQuery({ queryKey: ['device-sensors', id], queryFn: () => fetchDeviceSensors(id), enabled: Boolean(id) && tab === 'sensors' });
  const eventsQuery = useQuery({ queryKey: ['device-events', id], queryFn: () => fetchDeviceEvents(id), enabled: Boolean(id) && tab === 'events' });

  if (deviceQuery.isLoading) return <PageLayout title="Device"><LoadingPanel label="Loading device…" /></PageLayout>;
  if (deviceQuery.isError || !deviceQuery.data) {
    return <PageLayout title="Device"><EmptyState title="Device not found" description="The requested device could not be loaded." icon={<Cpu size={28} />} action={<Link href="/devices"><Button variant="secondary" size="sm"><ArrowLeft size={14} /> Back to devices</Button></Link>} /></PageLayout>;
  }
  const device = deviceQuery.data as any;

  return (
    <PageLayout title={`Device ${device.deviceId ?? device.id}`} description="Pictor device detail, telemetry, configuration and command history." breadcrumb={[{ label: 'Geoventra', href: '/' }, { label: 'Devices', href: '/devices' }, { label: device.deviceId ?? device.id }]}>
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/devices"><Button variant="secondary" size="sm"><ArrowLeft size={14} /> Back</Button></Link>
        <Badge variant={device.status === 'online' ? 'success' : device.status === 'offline' ? 'critical' : 'neutral'} dot>{device.status}</Badge>
        {device.activeFlag === false ? <Badge variant="neutral">Inactive</Badge> : null}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><div className="text-xs text-[var(--text-muted)]">Provider / Model</div><div className="font-medium">{device.provider} {device.model}</div><div className="text-xs text-[var(--text-muted)]">FW {device.firmwareVersion}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-[var(--text-muted)]">IMEI</div><div className="font-medium">{device.imei ?? '—'}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-[var(--text-muted)]">Last communication</div><div className="font-medium">{device.lastCommunicationAt ? new Date(device.lastCommunicationAt).toLocaleString() : '—'}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-[var(--text-muted)]">Vehicle</div><div className="font-medium">{device.vehicleRegistration ?? 'Unassigned'}</div></CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        {(['overview','config','commands','telemetry','capabilities','battery','sensors','events'] as Tab[]).map((t) => (
          <Button key={t} variant={tab === t ? 'primary' : 'secondary'} size="sm" onClick={() => setTab(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</Button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle as="h2">Firmware</CardTitle></CardHeader>
            <CardContent>
              {Array.isArray(firmwareQuery.data) && firmwareQuery.data.length ? (
                <ul className="text-sm space-y-2">
                  {firmwareQuery.data.map((f: any) => (
                    <li key={f.id} className="rounded-lg border border-[var(--border)] p-2">
                      <div className="font-medium">{f.firmware_version} {f.hardware_revision ? `· HW ${f.hardware_revision}` : ''}</div>
                      <div className="text-xs text-[var(--text-muted)]">OTA {f.ota_capable ? 'supported' : 'unsupported'} · {f.update_status}</div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No firmware records" description="Firmware metadata will appear after the first device report." icon={<Shield size={24} />} />}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle as="h2">Health</CardTitle></CardHeader>
            <CardContent>
              {Array.isArray(healthQuery.data) && healthQuery.data.length ? (
                <ul className="text-sm space-y-2">
                  {healthQuery.data.slice(0, 10).map((h: any) => (
                    <li key={h.id} className="rounded-lg border border-[var(--border)] p-2">
                      <div className="font-medium">{h.network_status ?? 'unknown'} · signal {h.signal_strength ?? '—'}</div>
                      <div className="text-xs text-[var(--text-muted)]">{new Date(h.recorded_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No health records" description="Device health will appear after the first report." icon={<Radio size={24} />} />}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle as="h2">Alarms</CardTitle></CardHeader>
            <CardContent>
              {Array.isArray(alarmsQuery.data) && alarmsQuery.data.length ? (
                <ul className="text-sm space-y-2">
                  {alarmsQuery.data.slice(0, 20).map((a: any) => (
                    <li key={a.id} className="rounded-lg border border-[var(--border)] p-2">
                      <div className="font-medium">{a.alarm_type} <span className="text-xs text-[var(--text-muted)]">({a.severity})</span></div>
                      <div className="text-xs text-[var(--text-muted)]">{a.message ?? ''} · {new Date(a.occurred_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              ) : <EmptyState title="No alarms" description="Device alarms will appear here." icon={<Shield size={24} />} />}
            </CardContent>
          </Card>
        </div>
      ) : null}

      {tab === 'config' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Configuration</CardTitle></CardHeader>
          <CardContent>
            {configQuery.isLoading ? <LoadingPanel label="Loading configuration…" /> : null}
            {!configQuery.isLoading && !configQuery.data ? <EmptyState title="No configuration" description="No configuration has been recorded for this device yet." icon={<Wrench size={24} />} /> : null}
            {configQuery.data ? <pre className="overflow-auto rounded-lg bg-[var(--bg-app)] p-3 text-xs">{JSON.stringify(configQuery.data, null, 2)}</pre> : null}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'commands' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Command history</CardTitle></CardHeader>
          <CardContent>
            {commandsQuery.isLoading ? <LoadingPanel label="Loading commands…" /> : null}
            {Array.isArray(commandsQuery.data?.data) && commandsQuery.data.data.length ? (
              <ul className="text-sm space-y-2">
                {commandsQuery.data.data.map((c: any) => (
                  <li key={c.id} className="rounded-lg border border-[var(--border)] p-2">
                    <div className="font-medium">{c.command_type} <span className="text-xs text-[var(--text-muted)]">({c.status})</span></div>
                    <div className="text-xs text-[var(--text-muted)]">{new Date(c.created_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (!commandsQuery.isLoading ? <EmptyState title="No commands" description="Command history will appear here." icon={<Wrench size={24} />} /> : null)}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'telemetry' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Telemetry</CardTitle></CardHeader>
          <CardContent>
            {telemetryQuery.isLoading ? <LoadingPanel label="Loading telemetry…" /> : null}
            {Array.isArray(telemetryQuery.data) && telemetryQuery.data.length ? (
              <ul className="text-sm space-y-2">
                {telemetryQuery.data.slice(0, 50).map((t: any) => (
                  <li key={t.id} className="rounded-lg border border-[var(--border)] p-2">
                    <div className="font-medium">{t.metric} = {t.value} {t.unit ?? ''}</div>
                    <div className="text-xs text-[var(--text-muted)]">{new Date(t.recorded_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (!telemetryQuery.isLoading ? <EmptyState title="No telemetry" description="Device telemetry will appear here." icon={<Radio size={24} />} /> : null)}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'capabilities' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Device capabilities</CardTitle></CardHeader>
          <CardContent>
            {capabilitiesQuery.isLoading ? <LoadingPanel label="Loading capabilities…" /> : null}
            {Array.isArray(capabilitiesQuery.data) && capabilitiesQuery.data.length ? (
              <ul className="text-sm space-y-2">
                {capabilitiesQuery.data.map((c: any) => (
                  <li key={c.capability} className="rounded-lg border border-[var(--border)] p-2">
                    <div className="font-medium">{c.capability}</div>
                    <div className="text-xs text-[var(--text-muted)]">{c.enabled ? 'Enabled' : 'Disabled'} · {c.unit ?? 'no unit'}</div>
                  </li>
                ))}
              </ul>
            ) : (!capabilitiesQuery.isLoading ? <EmptyState title="No capabilities" description="Capabilities will appear after onboarding or telemetry discovery." icon={<Cpu size={24} />} /> : null)}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'battery' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Battery history</CardTitle></CardHeader>
          <CardContent>
            {batteryQuery.isLoading ? <LoadingPanel label="Loading battery…" /> : null}
            {Array.isArray(batteryQuery.data) && batteryQuery.data.length ? (
              <ul className="text-sm space-y-2">
                {batteryQuery.data.slice(0, 50).map((b: any) => (
                  <li key={b.id} className="rounded-lg border border-[var(--border)] p-2">
                    <div className="font-medium">{b.percent ?? '—'}% · {b.voltage ?? '—'}V</div>
                    <div className="text-xs text-[var(--text-muted)]">{b.charging_status ?? 'unknown'} · {b.external_power_status ?? ''} · {new Date(b.recorded_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (!batteryQuery.isLoading ? <EmptyState title="No battery records" description="Battery telemetry will appear here." icon={<Battery size={24} />} /> : null)}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'sensors' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Sensor readings</CardTitle></CardHeader>
          <CardContent>
            {sensorsQuery.isLoading ? <LoadingPanel label="Loading sensors…" /> : null}
            {Array.isArray(sensorsQuery.data) && sensorsQuery.data.length ? (
              <ul className="text-sm space-y-2">
                {sensorsQuery.data.slice(0, 50).map((s: any) => (
                  <li key={s.id} className="rounded-lg border border-[var(--border)] p-2">
                    <div className="font-medium">{s.sensor_type} {s.channel ? `· ${s.channel}` : ''} = {s.value} {s.unit ?? ''}</div>
                    <div className="text-xs text-[var(--text-muted)]">{new Date(s.recorded_at).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (!sensorsQuery.isLoading ? <EmptyState title="No sensor readings" description="Sensor readings will appear here." icon={<Radio size={24} />} /> : null)}
          </CardContent>
        </Card>
      ) : null}

      {tab === 'events' ? (
        <Card>
          <CardHeader><CardTitle as="h2">Event timeline</CardTitle></CardHeader>
          <CardContent>
            {eventsQuery.isLoading ? <LoadingPanel label="Loading events…" /> : null}
            {Array.isArray(eventsQuery.data) && eventsQuery.data.length ? (
              <ul className="text-sm space-y-2">
                {eventsQuery.data.map((e: any) => (
                  <li key={e.id} className="rounded-lg border border-[var(--border)] p-2">
                    <div className="font-medium">{e.kind}: {e.title} {e.status ? `(${e.status})` : ''}</div>
                    <div className="text-xs text-[var(--text-muted)]">{e.detail ?? ''} · {new Date(e.occurredAt).toLocaleString()}</div>
                  </li>
                ))}
              </ul>
            ) : (!eventsQuery.isLoading ? <EmptyState title="No events" description="Device events will appear here." icon={<Radio size={24} />} /> : null)}
          </CardContent>
        </Card>
      ) : null}
    </PageLayout>
  );
}