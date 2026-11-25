import { afterAll, beforeAll, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { DeviceAdaptersController } from './device-adapters.controller.js';
import { DeviceAdaptersService } from './device-adapters.service.js';

const SERVICE_METHODS = [
  'adapterHealth', 'listManufacturers', 'createManufacturer', 'updateManufacturer', 'deleteManufacturer',
  'listModels', 'createModel', 'updateModel', 'deleteModel',
  'listCapabilities', 'createCapability', 'updateCapability', 'deleteCapability',
  'listFieldMappings', 'createFieldMapping', 'updateFieldMapping', 'deleteFieldMapping',
  'listIntegrationConfigs', 'createIntegrationConfig', 'updateIntegrationConfig', 'deleteIntegrationConfig',
  'listConnectionStatus', 'listIngestionAudit',
] as const;

type MethodName = (typeof SERVICE_METHODS)[number];

describe('DeviceAdaptersController routes', () => {
  let app: INestApplication;
  const service = Object.fromEntries(SERVICE_METHODS.map((name) => [name, vi.fn().mockResolvedValue({ ok: true })])) as Record<MethodName, Mock>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [DeviceAdaptersController],
      providers: [{ provide: DeviceAdaptersService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: { switchToHttp: () => { getRequest: () => { user: unknown } } }) => {
          context.switchToHttp().getRequest().user = { organisationId: 'org-1' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const server = () => app.getHttpServer();

  it('routes health and manufacturer CRUD', async () => {
    await request(server()).get('/device-adapters/health').expect(200);
    await request(server()).get('/device-adapters/manufacturers').expect(200);
    await request(server()).post('/device-adapters/manufacturers').send({ name: 'Acme', code: 'ACME' }).expect(201);
    await request(server()).patch('/device-adapters/manufacturers/mfr-1').send({ name: 'Acme 2' }).expect(200);
    await request(server()).delete('/device-adapters/manufacturers/mfr-1').expect(200);

    expect(service.adapterHealth).toHaveBeenCalledWith('org-1');
    expect(service.listManufacturers).toHaveBeenCalledWith('org-1');
    expect(service.createManufacturer).toHaveBeenCalledWith('org-1', { name: 'Acme', code: 'ACME' });
    expect(service.updateManufacturer).toHaveBeenCalledWith('org-1', 'mfr-1', { name: 'Acme 2' });
    expect(service.deleteManufacturer).toHaveBeenCalledWith('org-1', 'mfr-1');
  });

  it('routes model CRUD and model capability creation', async () => {
    await request(server()).get('/device-adapters/models?manufacturerId=mfr-1').expect(200);
    await request(server()).post('/device-adapters/models').send({ name: 'FMB920', modelCode: 'FMB920' }).expect(201);
    await request(server()).patch('/device-adapters/models/model-1').send({ name: 'FMB920v2' }).expect(200);
    await request(server()).delete('/device-adapters/models/model-1').expect(200);
    await request(server()).get('/device-adapters/models/model-1/capabilities').expect(200);
    await request(server()).post('/device-adapters/models/model-1/capabilities').send({ capability: 'ignition' }).expect(201);

    expect(service.listModels).toHaveBeenCalledWith('org-1', 'mfr-1');
    expect(service.createModel).toHaveBeenCalledWith('org-1', { name: 'FMB920', modelCode: 'FMB920' });
    expect(service.updateModel).toHaveBeenCalledWith('org-1', 'model-1', { name: 'FMB920v2' });
    expect(service.deleteModel).toHaveBeenCalledWith('org-1', 'model-1');
    expect(service.listCapabilities).toHaveBeenCalledWith('org-1', 'model-1');
    expect(service.createCapability).toHaveBeenCalledWith('org-1', 'model-1', { capability: 'ignition' });
  });

  it('routes capability reads, updates and deletes', async () => {
    await request(server()).get('/device-adapters/capabilities').expect(200);
    await request(server()).patch('/device-adapters/capabilities/cap-1').send({ enabled: false }).expect(200);
    await request(server()).delete('/device-adapters/capabilities/cap-1').expect(200);

    expect(service.listCapabilities).toHaveBeenCalledWith('org-1');
    expect(service.updateCapability).toHaveBeenCalledWith('org-1', 'cap-1', { enabled: false });
    expect(service.deleteCapability).toHaveBeenCalledWith('org-1', 'cap-1');
  });

  it('routes field mapping CRUD with filters', async () => {
    await request(server()).get('/device-adapters/field-mappings?manufacturerId=mfr-1&modelId=model-1').expect(200);
    await request(server()).post('/device-adapters/field-mappings').send({ sourceField: 'io7', targetMetric: 'ignition' }).expect(201);
    await request(server()).patch('/device-adapters/field-mappings/map-1').send({ unit: 'boolean' }).expect(200);
    await request(server()).delete('/device-adapters/field-mappings/map-1').expect(200);

    expect(service.listFieldMappings).toHaveBeenCalledWith('org-1', 'mfr-1', 'model-1');
    expect(service.createFieldMapping).toHaveBeenCalledWith('org-1', { sourceField: 'io7', targetMetric: 'ignition' });
    expect(service.updateFieldMapping).toHaveBeenCalledWith('org-1', 'map-1', { unit: 'boolean' });
    expect(service.deleteFieldMapping).toHaveBeenCalledWith('org-1', 'map-1');
  });

  it('routes integration config CRUD with filters', async () => {
    await request(server()).get('/device-adapters/integration-configs?manufacturerId=mfr-1&modelId=model-1&enabled=true').expect(200);
    await request(server()).post('/device-adapters/integration-configs').send({ name: 'Acme MQTT' }).expect(201);
    await request(server()).patch('/device-adapters/integration-configs/cfg-1').send({ enabled: false }).expect(200);
    await request(server()).delete('/device-adapters/integration-configs/cfg-1').expect(200);

    expect(service.listIntegrationConfigs).toHaveBeenCalledWith('org-1', {
      manufacturerId: 'mfr-1', modelId: 'model-1', enabled: 'true',
    });
    expect(service.createIntegrationConfig).toHaveBeenCalledWith('org-1', { name: 'Acme MQTT' });
    expect(service.updateIntegrationConfig).toHaveBeenCalledWith('org-1', 'cfg-1', { enabled: false });
    expect(service.deleteIntegrationConfig).toHaveBeenCalledWith('org-1', 'cfg-1');
  });

  it('routes connection and audit reads with filters', async () => {
    await request(server()).get('/device-adapters/connection-status?status=offline&search=DEV1').expect(200);
    await request(server()).get('/device-adapters/ingestion-audit?outcome=accepted&source=mqtt&limit=25').expect(200);

    expect(service.listConnectionStatus).toHaveBeenCalledWith('org-1', { status: 'offline', search: 'DEV1' });
    expect(service.listIngestionAudit).toHaveBeenCalledWith('org-1', {
      outcome: 'accepted', source: 'mqtt', limit: 25,
    });
  });
});
