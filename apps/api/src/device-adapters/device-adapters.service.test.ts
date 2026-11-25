import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DeviceAdaptersService } from './device-adapters.service.js';

describe('DeviceAdaptersService', () => {
  let db: { query: ReturnType<typeof vi.fn>; queryOne: ReturnType<typeof vi.fn> };
  let service: DeviceAdaptersService;
  const org = 'org-1';

  beforeEach(() => {
    db = { query: vi.fn().mockResolvedValue([]), queryOne: vi.fn().mockResolvedValue(undefined) };
    service = new DeviceAdaptersService(
      db as never,
      { getStatus: () => ({ started: true }) } as never,
      { getStatus: () => ({ started: false }) } as never,
    );
  });

  it('validates required manufacturer fields', async () => {
    await expect(service.createManufacturer(org, { code: 'ACME' })).rejects.toThrow(BadRequestException);
    db.queryOne.mockResolvedValueOnce({ id: 'mfr-1', name: 'Acme' });
    await expect(service.createManufacturer(org, { name: 'Acme', code: 'ACME' })).resolves.toMatchObject({ id: 'mfr-1' });
    expect(db.queryOne).toHaveBeenCalledTimes(1);
  });

  it('scopes updates to the organisation and whitelists fields', async () => {
    db.queryOne.mockResolvedValueOnce({ id: 'mfr-1', name: 'New name' });
    await service.updateManufacturer(org, 'mfr-1', { name: 'New name', malicious: 'x' });
    const [sql, params] = db.queryOne.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('UPDATE geoventra.device_manufacturers');
    expect(sql).toContain('organisation_id=$2');
    expect(sql).not.toContain('malicious');
    expect(params).toEqual(['New name', org, 'mfr-1']);
  });

  it('rejects unknown models during capability creation', async () => {
    await expect(service.createCapability(org, 'missing-model', { capability: 'gps' })).rejects.toThrow(NotFoundException);
  });

  it('rejects out-of-range data types for field mappings', async () => {
    await expect(service.createFieldMapping(org, {
      sourceField: 'temp', targetMetric: 'temperature', dataType: 'blob',
    })).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid enum values on updates', async () => {
    await expect(service.updateModel(org, 'model-1', { deviceCategory: 'UNKNOWN' })).rejects.toThrow(BadRequestException);
    await expect(service.updateIntegrationConfig(org, 'cfg-1', { authType: 'password' })).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid audit and connection filters', async () => {
    await expect(service.listIngestionAudit(org, { outcome: 'unknown' })).rejects.toThrow(BadRequestException);
    await expect(service.listConnectionStatus(org, { status: 'connecting' })).rejects.toThrow(BadRequestException);
  });

  it('tenant-scopes capability reads', async () => {
    await service.listCapabilities(org, 'model-1');
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('c.organisation_id=$1');
    expect(sql).toContain('c.model_id=$2');
    expect(params).toEqual([org, 'model-1']);
  });

  it('applies audit filters and clamps the row limit', async () => {
    await service.listIngestionAudit(org, { outcome: 'accepted', source: 'mqtt', limit: 5000 });
    const [sql, params] = db.query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('outcome=$2');
    expect(sql).toContain('source=$3');
    expect(sql).toContain('LIMIT $4');
    expect(params).toEqual([org, 'accepted', 'mqtt', 200]);
  });

  it('reports registry counts and TCP listener state', async () => {
    db.queryOne.mockResolvedValue({ count: '2' });
    db.query.mockResolvedValue([{ integration_method: 'TCP', models: '2' }]);
    const health = await service.adapterHealth(org);
    expect(health.counts).toEqual({ manufacturers: 2, models: 2, capabilities: 2, fieldMappings: 2, integrationConfigs: 2 });
    expect(health.integrationMethods).toEqual([{ method: 'TCP', models: 2 }]);
    expect(health.listeners).toEqual({ pt06: { started: true }, ps10: { started: false } });
  });
});
