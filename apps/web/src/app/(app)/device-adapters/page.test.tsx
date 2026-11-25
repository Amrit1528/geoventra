import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DeviceAdaptersPage from './page';
import * as api from '@/lib/device-adapters-api';
import type {
  AdapterHealth,
  AuditRow,
  Capability,
  ConnectionRow,
  DeviceModel,
  FieldMapping,
  IntegrationConfig,
  Manufacturer,
} from '@/lib/device-adapters-api';

vi.mock('@/lib/device-adapters-api', () => ({
  fetchAdapterHealth: vi.fn(),
  fetchManufacturers: vi.fn(),
  createManufacturer: vi.fn(),
  updateManufacturer: vi.fn(),
  deleteManufacturer: vi.fn(),
  fetchModels: vi.fn(),
  createModel: vi.fn(),
  updateModel: vi.fn(),
  deleteModel: vi.fn(),
  fetchCapabilities: vi.fn(),
  fetchModelCapabilities: vi.fn(),
  createCapability: vi.fn(),
  updateCapability: vi.fn(),
  deleteCapability: vi.fn(),
  fetchFieldMappings: vi.fn(),
  createFieldMapping: vi.fn(),
  updateFieldMapping: vi.fn(),
  deleteFieldMapping: vi.fn(),
  fetchIntegrationConfigs: vi.fn(),
  createIntegrationConfig: vi.fn(),
  updateIntegrationConfig: vi.fn(),
  deleteIntegrationConfig: vi.fn(),
  fetchConnectionStatus: vi.fn(),
  fetchIngestionAudit: vi.fn(),
}));

const manufacturer: Manufacturer = {
  id: 'mfr-1', name: 'Acme', code: 'ACME', country: 'IN', website: null,
  contact_email: 'ops@acme.test', notes: null, model_count: 1,
};
const model: DeviceModel = {
  id: 'model-1', manufacturer_id: 'mfr-1', name: 'FMB920', model_code: 'FMB920',
  device_category: 'STANDARD_GPS', integration_method: 'MQTT', protocol_version: '1.2',
  certification_ref: null, telemetry_fields: ['lat', 'lon'], metadata: {},
  manufacturer_name: 'Acme', capability_count: 1,
};
const capability: Capability = {
  id: 'cap-1', model_id: 'model-1', capability: 'ignition', enabled: true,
  unit: null, metadata: {}, model_name: 'FMB920',
};
const mapping: FieldMapping = {
  id: 'map-1', manufacturer_id: 'mfr-1', model_id: 'model-1', source_field: 'io7',
  target_metric: 'ignition', data_type: 'boolean', unit: null, scale: null,
  value_offset: null, model_name: 'FMB920',
};
const config: IntegrationConfig = {
  id: 'cfg-1', manufacturer_id: 'mfr-1', model_id: 'model-1', device_id: null,
  name: 'Acme MQTT', integration_method: 'MQTT', endpoint_url: 'mqtt://broker',
  auth_type: 'none', secret_ref: null, headers: {}, rate_limit_per_minute: 120,
  replay_window_seconds: 300, enabled: true, model_name: 'FMB920', manufacturer_name: 'Acme',
};
const connection: ConnectionRow = {
  device_id: 'dev-1', serial: 'DEV-001', status: 'online', connectivity_status: 'online',
  last_message_at: '2026-11-25T10:00:00.000Z', last_communication_at: '2026-11-25T10:00:00.000Z',
  messages_last_hour: 12, consecutive_failures: 0, last_error: null,
};
const audit: AuditRow = {
  id: 'audit-1', device_id: 'dev-1', manufacturer_id: 'mfr-1', model_id: 'model-1',
  message_id: 'msg-1', source: 'mqtt', outcome: 'accepted', reason: null,
  payload_bytes: 256, latency_ms: 12, received_at: '2026-11-25T10:00:00.000Z',
};
const health: AdapterHealth = {
  status: 'ok', generatedAt: '2026-11-25T10:00:00.000Z',
  counts: { manufacturers: 1, models: 1, capabilities: 1, fieldMappings: 1, integrationConfigs: 1 },
  integrationMethods: [{ method: 'MQTT', models: 1 }],
  listeners: { pt06: { started: true }, ps10: { started: false } },
};

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <DeviceAdaptersPage />
    </QueryClientProvider>,
  );
}

function mocked<T extends (...args: never[]) => unknown>(fn: T): Mock {
  return fn as unknown as Mock;
}

describe('Device adapters page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));

    mocked(api.fetchAdapterHealth).mockResolvedValue(health);
    mocked(api.fetchManufacturers).mockResolvedValue([manufacturer]);
    mocked(api.fetchModels).mockResolvedValue([model]);
    mocked(api.fetchCapabilities).mockResolvedValue([capability]);
    mocked(api.fetchFieldMappings).mockResolvedValue([mapping]);
    mocked(api.fetchIntegrationConfigs).mockResolvedValue([config]);
    mocked(api.fetchConnectionStatus).mockResolvedValue([connection]);
    mocked(api.fetchIngestionAudit).mockResolvedValue([audit]);

    mocked(api.createManufacturer).mockResolvedValue(manufacturer);
    mocked(api.updateManufacturer).mockResolvedValue(manufacturer);
    mocked(api.deleteManufacturer).mockResolvedValue({ id: manufacturer.id });
    mocked(api.createModel).mockResolvedValue(model);
    mocked(api.updateModel).mockResolvedValue(model);
    mocked(api.deleteModel).mockResolvedValue({ id: model.id });
    mocked(api.createCapability).mockResolvedValue(capability);
    mocked(api.updateCapability).mockResolvedValue(capability);
    mocked(api.deleteCapability).mockResolvedValue({ id: capability.id });
    mocked(api.createFieldMapping).mockResolvedValue(mapping);
    mocked(api.updateFieldMapping).mockResolvedValue(mapping);
    mocked(api.deleteFieldMapping).mockResolvedValue({ id: mapping.id });
    mocked(api.createIntegrationConfig).mockResolvedValue(config);
    mocked(api.updateIntegrationConfig).mockResolvedValue(config);
    mocked(api.deleteIntegrationConfig).mockResolvedValue({ id: config.id });
  });

  it('loads overview health, listener status and recent connections', async () => {
    renderPage();

    expect(await screen.findByText('MQTT: 1')).toBeTruthy();
    expect(screen.getByText('Listening')).toBeTruthy();
    expect(screen.getByText('Stopped')).toBeTruthy();
    expect(screen.getByText('DEV-001')).toBeTruthy();
    expect(mocked(api.fetchAdapterHealth)).toHaveBeenCalledTimes(1);
    expect(mocked(api.fetchConnectionStatus)).toHaveBeenCalled();
  });

  it('creates a manufacturer through the form', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Manufacturers' }));
    expect(await screen.findByText('Acme')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Manufacturer' }));
    const dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Name *'), { target: { value: 'New Co' } });
    fireEvent.change(within(dialog).getByLabelText('Code *'), { target: { value: 'NEW' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mocked(api.createManufacturer)).toHaveBeenCalledWith(expect.objectContaining({ name: 'New Co', code: 'NEW' }));
    });
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());
  });

  it('edits and deletes a model with confirmation', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Models' }));
    expect((await screen.findAllByText('FMB920')).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Edit FMB920' }));
    const dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Model name *'), { target: { value: 'FMB920 revised' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocked(api.updateModel)).toHaveBeenCalledWith('model-1', expect.objectContaining({ name: 'FMB920 revised' }));
    });
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Delete FMB920' }));
    await waitFor(() => expect(mocked(api.deleteModel)).toHaveBeenCalledWith('model-1'));
  });

  it('adds a capability and toggles an existing one', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Capabilities' }));
    expect(await screen.findByText('ignition')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Enabled' }));
    await waitFor(() => {
      expect(mocked(api.updateCapability)).toHaveBeenCalledWith('cap-1', { enabled: false });
    });

    fireEvent.change(screen.getByLabelText('Model for new capability'), { target: { value: 'model-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add capability' }));
    const dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Capability *'), { target: { value: 'fuel_level' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mocked(api.createCapability)).toHaveBeenCalledWith('model-1', expect.objectContaining({ capability: 'fuel_level', enabled: true }));
    });
  });

  it('filters field mappings by manufacturer', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Field mappings' }));
    expect(await screen.findByText('io7')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filter by manufacturer'), { target: { value: 'mfr-1' } });
    await waitFor(() => {
      const calls = mocked(api.fetchFieldMappings).mock.calls;
      expect(calls[calls.length - 1]?.[0]).toEqual({ manufacturerId: 'mfr-1', modelId: undefined });
    });
  });

  it('creates an integration config and toggles it', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Integration configs' }));
    expect(await screen.findByText('Acme MQTT')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Enabled' }));
    await waitFor(() => {
      expect(mocked(api.updateIntegrationConfig)).toHaveBeenCalledWith('cfg-1', { enabled: false });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Config' }));
    const dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Name *'), { target: { value: 'Acme HTTP' } });
    fireEvent.change(within(dialog).getByLabelText('Endpoint URL'), { target: { value: 'https://ingest.acme.test' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(mocked(api.createIntegrationConfig)).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Acme HTTP', endpointUrl: 'https://ingest.acme.test', rateLimitPerMinute: 120,
      }));
    });
  });

  it('handles the remaining create, edit and delete actions', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Manufacturers' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme' }));
    let dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Code *'), { target: { value: 'ACME-2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocked(api.updateManufacturer)).toHaveBeenCalledWith('mfr-1', expect.objectContaining({ code: 'ACME-2' })));
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Models' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Model' }));
    dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Manufacturer'), { target: { value: 'mfr-1' } });
    fireEvent.change(within(dialog).getByLabelText('Model name *'), { target: { value: 'New model' } });
    fireEvent.change(within(dialog).getByLabelText('Model code *'), { target: { value: 'NEW-1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mocked(api.createModel)).toHaveBeenCalledWith(expect.objectContaining({
      manufacturerId: 'mfr-1', name: 'New model', modelCode: 'NEW-1',
    })));
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Capabilities' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit ignition' }));
    dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Capability *'), { target: { value: 'ignition_v2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocked(api.updateCapability)).toHaveBeenCalledWith('cap-1', expect.objectContaining({ capability: 'ignition_v2' })));
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Delete ignition' }));
    await waitFor(() => expect(mocked(api.deleteCapability)).toHaveBeenCalledWith('cap-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Field mappings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Mapping' }));
    dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Source field *'), { target: { value: 'can.fuel' } });
    fireEvent.change(within(dialog).getByLabelText('Target metric *'), { target: { value: 'fuel_level' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(mocked(api.createFieldMapping)).toHaveBeenCalledWith(expect.objectContaining({
      sourceField: 'can.fuel', targetMetric: 'fuel_level',
    })));
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Edit io7' }));
    dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Target metric *'), { target: { value: 'ignition_state' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocked(api.updateFieldMapping)).toHaveBeenCalledWith('map-1', expect.objectContaining({ targetMetric: 'ignition_state' })));
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Delete io7' }));
    await waitFor(() => expect(mocked(api.deleteFieldMapping)).toHaveBeenCalledWith('map-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Integration configs' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Acme MQTT' }));
    dialog = screen.getByTestId('device-adapter-editor');
    fireEvent.change(within(dialog).getByLabelText('Name *'), { target: { value: 'Acme MQTT v2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mocked(api.updateIntegrationConfig)).toHaveBeenCalledWith('cfg-1', expect.objectContaining({ name: 'Acme MQTT v2' })));
    await waitFor(() => expect(screen.queryByTestId('device-adapter-editor')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Acme MQTT' }));
    await waitFor(() => expect(mocked(api.deleteIntegrationConfig)).toHaveBeenCalledWith('cfg-1'));
  });

  it('filters connections and ingestion audit', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Connections' }));
    expect(await screen.findByText('DEV-001')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Connection status'), { target: { value: 'offline' } });
    fireEvent.change(screen.getByPlaceholderText('Device ID or IMEI'), { target: { value: 'DEV1' } });
    await waitFor(() => {
      const calls = mocked(api.fetchConnectionStatus).mock.calls;
      expect(calls[calls.length - 1]?.[0]).toEqual({ status: 'offline', search: 'DEV1' });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Ingestion audit' }));
    expect(await screen.findByText('accepted')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Audit outcome'), { target: { value: 'accepted' } });
    fireEvent.change(screen.getByLabelText('Audit source'), { target: { value: 'mqtt' } });
    fireEvent.change(screen.getByLabelText('Audit row limit'), { target: { value: '25' } });
    await waitFor(() => {
      const calls = mocked(api.fetchIngestionAudit).mock.calls;
      expect(calls[calls.length - 1]?.[0]).toEqual({ outcome: 'accepted', source: 'mqtt', limit: 25 });
    });
  });
});
