import { describe, expect, it, vi } from 'vitest';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { WhatsAppManager } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';
import type { BaileysTransport } from '../../../../src/infrastructure/baileys/BaileysTransport.js';
import type {
  WhatsAppMessageReceivedPayload,
  WhatsAppMessageUpdatedPayload,
} from '../../../../src/domain/ports/index.js';
import { FakeTransport } from '../../../mocks/fake-transport.js';
import { InMemoryAuthRepository } from '../../../mocks/repositories.js';
import type { TransportFactory } from '../../../../src/infrastructure/baileys/WhatsAppManager.js';

function setup(
  opts: {
    failConnect?: boolean;
    onMessageReceived?: (payload: WhatsAppMessageReceivedPayload) => void;
    onMessageUpdated?: (payload: WhatsAppMessageUpdatedPayload) => void;
  } = {},
) {
  const authRepository = new InMemoryAuthRepository();
  const transports: FakeTransport[] = [];
  const sendRuntimeEvent = vi.fn();

  const transportFactory: TransportFactory = () => {
    const t = new FakeTransport({
      tenantId: 'tenant-1',
      instanceId: 'inst_1',
      failConnect: opts.failConnect,
    });
    transports.push(t);
    return t as unknown as BaileysTransport;
  };

  const manager = new WhatsAppManager({
    authRepository,
    transportFactory,
    sendRuntimeEvent,
    onMessageReceived: opts.onMessageReceived,
    onMessageUpdated: opts.onMessageUpdated,
  });

  return { manager, authRepository, transports, sendRuntimeEvent };
}

describe('WhatsAppManager', () => {
  describe('createInstance', () => {
    it('creates a runtime, connects the transport, and sets flags', async () => {
      const { manager, transports } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      expect(runtime.tenantId).toBe('tenant-1');
      expect(runtime.instanceId).toBe('inst_1');
      expect(runtime.flags.connecting).toBe(true);
      expect(transports[0].connectAttempts).toBe(1);
      expect(transports[0].isConnected()).toBe(true);
    });

    it('reuses the existing runtime without double connecting', async () => {
      const { manager, transports } = setup();
      const first = await manager.createInstance('tenant-1', 'inst_1');
      const second = await manager.createInstance('tenant-1', 'inst_1');

      expect(second).toBe(first);
      expect(transports[0].connectAttempts).toBe(1);
    });

    it('removes the instance from the map when connect fails', async () => {
      const { manager } = setup({ failConnect: true });

      await expect(manager.createInstance('tenant-1', 'inst_1')).rejects.toThrow(
        'fake connect failure',
      );
      expect(manager.getInstance('inst_1')).toBeUndefined();
      expect(manager.getAllInstances()).toHaveLength(0);
    });
  });

  describe('disconnectInstance', () => {
    it('sets stopped and disconnects the transport', async () => {
      const { manager, transports } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      await expect(manager.disconnectInstance('inst_1')).resolves.toBe(true);
      expect(runtime.flags.stopped).toBe(true);
      expect(transports[0].disconnectCalls).toBe(1);
    });
  });

  describe('deleteInstance', () => {
    it('removes the instance and its mutex', async () => {
      const { manager, transports } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      await expect(manager.deleteInstance('inst_1')).resolves.toBe(true);
      expect(runtime.flags.stopped).toBe(true);
      expect(runtime.flags.deleting).toBe(true);
      expect(transports[0].disconnectCalls).toBe(1);
      expect(manager.getInstance('inst_1')).toBeUndefined();
    });
  });

  describe('reconnectInstance', () => {
    it('resets flags and reconnectAttempts', async () => {
      const { manager, transports } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      // disconnect first so the transport is not connected
      await manager.disconnectInstance('inst_1');

      runtime.flags.connecting = false;
      runtime.reconnectAttempts = 3;
      runtime.flags.stopped = true;

      const reconnected = await manager.reconnectInstance('inst_1');
      expect(reconnected).not.toBeNull();
      expect(runtime.reconnectAttempts).toBe(0);
      expect(runtime.flags.stopped).toBe(false);
      expect(runtime.flags.deleting).toBe(false);
      expect(transports[0].connectAttempts).toBe(2);
    });
  });

  describe('events', () => {
    it('updates lastQr and emits instance.qr on qr', async () => {
      const { manager, transports, sendRuntimeEvent } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      transports[0].emitQr('qr-data', 60);

      expect(runtime.lastQr).toBe('qr-data');
      expect(sendRuntimeEvent).toHaveBeenCalledWith('instance.qr', {
        instanceId: 'inst_1',
        qr: 'qr-data',
        ttl: 60,
      });
    });

    it('clears connecting flag and emits instance.connected on connect', async () => {
      const { manager, transports, sendRuntimeEvent } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      transports[0].emitConnected('5511999990000');

      expect(runtime.flags.connecting).toBe(false);
      expect(sendRuntimeEvent).toHaveBeenCalledWith(
        'instance.connected',
        expect.objectContaining({ instanceId: 'inst_1', phoneNumber: '5511999990000' }),
      );
    });

    it('schedules a reconnect timer on unexpected disconnect and clears on shutdown', async () => {
      const { manager, transports } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      transports[0].emitConnected();
      transports[0].emitDisconnected('connectionClosed');

      expect(runtime.reconnectTimer).not.toBeNull();
      expect(runtime.flags.connecting).toBe(true);

      await manager.shutdown();
      expect(runtime.reconnectTimer).toBeNull();
    });

    it('does not schedule a reconnect when disconnected with loggedOut reason', async () => {
      const { manager, transports } = setup();
      const runtime = await manager.createInstance('tenant-1', 'inst_1');

      transports[0].emitConnected();
      transports[0].emitDisconnected(String(DisconnectReason.loggedOut));

      expect(runtime.flags.stopped).toBe(true);
      expect(runtime.reconnectTimer).toBeNull();

      await manager.shutdown();
    });
  });

  describe('message callbacks', () => {
    it('triggers onMessageReceived with the payload', async () => {
      const onMessageReceived = vi.fn();
      const { manager, transports } = setup({ onMessageReceived });
      await manager.createInstance('tenant-1', 'inst_1');

      const payload = transports[0].emitMessage({ messageId: 'remote_msg_x' });

      // callbacks are invoked fire-and-forget
      await vi.waitFor(() => expect(onMessageReceived).toHaveBeenCalledWith(payload));
    });

    it('triggers onMessageUpdated with the payload', async () => {
      const onMessageUpdated = vi.fn();
      const { manager, transports } = setup({ onMessageUpdated });
      await manager.createInstance('tenant-1', 'inst_1');

      transports[0].emitMessageUpdated({ messageId: 'remote_msg_updated' });

      await vi.waitFor(() =>
        expect(onMessageUpdated).toHaveBeenCalledWith(
          expect.objectContaining({ messageId: 'remote_msg_updated' }),
        ),
      );
    });
  });

  describe('shutdown', () => {
    it('disconnects all transports and clears maps', async () => {
      const { manager, transports } = setup();
      await manager.createInstance('tenant-1', 'inst_1');

      await manager.shutdown();

      expect(transports[0].disconnectCalls).toBe(1);
      expect(manager.getAllInstances()).toHaveLength(0);
    });
  });

  describe('isRunning and getInstance', () => {
    it('reflects connection state', async () => {
      const { manager, transports } = setup();
      await manager.createInstance('tenant-1', 'inst_1');

      expect(manager.isRunning('inst_1')).toBe(true);
      await manager.disconnectInstance('inst_1');
      expect(manager.isRunning('inst_1')).toBe(false);
    });

    it('returns undefined for an unknown id and lists all instances', async () => {
      const { manager } = setup();
      expect(manager.getInstance('nope')).toBeUndefined();
      await manager.createInstance('tenant-1', 'inst_1');
      expect(manager.getAllInstances()).toHaveLength(1);
      expect(manager.getInstance('inst_1')?.instanceId).toBe('inst_1');
    });
  });
});
