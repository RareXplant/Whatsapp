import { describe, expect, it, vi } from 'vitest';
import { StartupService } from '../../../../src/application/services/startup.service.js';
import { WhatsAppManager } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';
import type { TransportFactory } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';
import type { BaileysTransport } from '../../../../src/infrastructure/baileys/BaileysTransport.js';
import type { LeaseManager } from '../../../../src/infrastructure/lease/lease-manager.js';
import { FakeTransport } from '../../../mocks/fake-transport.js';
import { InMemoryAuthRepository, InMemoryInstanceRepository } from '../../../mocks/repositories.js';
import { makeInstance } from '../../../helpers/factories.js';

function setup() {
  const instanceRepository = new InMemoryInstanceRepository();
  const authRepository = new InMemoryAuthRepository();
  const transports: FakeTransport[] = [];

  const transportFactory: TransportFactory = () => {
    const t = new FakeTransport({ tenantId: 'tenant-1', instanceId: 'inst' });
    transports.push(t);
    return t as unknown as BaileysTransport;
  };

  const manager = new WhatsAppManager({
    authRepository,
    transportFactory,
  });

  const service = new StartupService({
    instanceRepository,
    authRepository,
    whatsAppManager: manager,
    leaseManager: {
      acquire: vi.fn().mockResolvedValue(true),
      release: vi.fn().mockResolvedValue(undefined),
      startRenewal: vi.fn(),
      stopRenewal: vi.fn(),
      releaseAll: vi.fn().mockResolvedValue(undefined),
      getOwnerId: vi.fn().mockReturnValue('test-owner'),
    } as unknown as LeaseManager,
  });

  return { service, instanceRepository, authRepository, manager };
}

describe('StartupService', () => {
  it('returns 0 when no instances are eligible', async () => {
    const { service } = setup();
    const count = await service.startup();
    expect(count).toBe(0);
  });

  it('starts only instances that have saved creds', async () => {
    const { service, instanceRepository, authRepository, manager } = setup();
    instanceRepository.items.set(
      'a',
      makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'a', status: 'connecting' }),
    );
    instanceRepository.items.set(
      'b',
      makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_b', _id: 'b', status: 'connecting' }),
    );

    await authRepository.saveCreds('tenant-1', 'inst_a', {});

    const createSpy = vi.spyOn(manager, 'createInstance');
    const findAllSpy = vi.spyOn(instanceRepository, 'findAll');

    const succeeded = await service.startup();

    expect(findAllSpy).toHaveBeenCalled();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy).toHaveBeenCalledWith('tenant-1', 'inst_a');
    expect(succeeded).toBe(1);

    // instance with creds updated to 'connecting'
    expect(instanceRepository.items.get('a')?.status).toBe('connecting');
    // instance without creds untouched
    expect(instanceRepository.items.get('b')?.status).toBe('connecting');

    await manager.shutdown();
  });

  it('skips excluded statuses even when creds exist', async () => {
    const { service, instanceRepository, authRepository, manager } = setup();
    instanceRepository.items.set(
      'a',
      makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_a', _id: 'a', status: 'logged_out' }),
    );
    instanceRepository.items.set(
      'b',
      makeInstance({ tenantId: 'tenant-1', instanceId: 'inst_b', _id: 'b', status: 'deleting' }),
    );

    await authRepository.saveCreds('tenant-1', 'inst_a', {});
    await authRepository.saveCreds('tenant-1', 'inst_b', {});

    const createSpy = vi.spyOn(manager, 'createInstance');
    const succeeded = await service.startup();

    expect(createSpy).not.toHaveBeenCalled();
    expect(succeeded).toBe(0);

    await manager.shutdown();
  });
});
