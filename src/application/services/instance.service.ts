import { logger, type Logger } from '../../logger.js';
import type { Instance } from '../../domain/entities/index.js';
import type {
  InstanceRepository,
  CreateInstanceInput,
  WebhookDispatcherPort,
} from '../../domain/ports/index.js';
import type {
  WhatsAppManager,
  RuntimeInstance,
} from '../../infrastructure/baileys/WhatsAppManager.js';
import {
  InstanceNotConnectedError,
  InstanceNotFoundError,
  NotFoundError,
} from '../../shared/errors/index.js';
import { generateInstanceId, generateWebhookSecret } from '../../shared/crypto/index.js';

export interface CreateInstanceParams {
  name: string;
  webhookUrl?: string | null;
  webhookSecret?: string | null;
  usePairingCode?: boolean;
  phoneNumber?: string | null;
}

export interface UpdateWebhookParams {
  webhookUrl: string;
  webhookSecret?: string | null;
}

export interface InstanceServiceOptions {
  instanceRepository: InstanceRepository;
  whatsAppManager: WhatsAppManager;
  webhookDispatcher: WebhookDispatcherPort;
  logger?: Logger;
}

export class InstanceService {
  private readonly instanceRepository: InstanceRepository;
  private readonly whatsAppManager: WhatsAppManager;
  private readonly webhookDispatcher: WebhookDispatcherPort;
  private readonly logger: Logger;

  constructor(options: InstanceServiceOptions) {
    this.instanceRepository = options.instanceRepository;
    this.whatsAppManager = options.whatsAppManager;
    this.webhookDispatcher = options.webhookDispatcher;
    this.logger = options.logger ?? logger;
  }

  async createInstance(
    tenantId: string,
    userId: string,
    params: CreateInstanceParams,
  ): Promise<unknown> {
    const instanceId = generateInstanceId();

    const secret = params.webhookSecret ?? (params.webhookUrl ? generateWebhookSecret() : null);

    const createInput: CreateInstanceInput = {
      tenantId,
      instanceId,
      name: params.name,
      status: 'created',
      webhookUrl: params.webhookUrl ?? null,
      webhookSecret: secret,
      pairingPhoneNumber: params.usePairingCode ? (params.phoneNumber ?? null) : null,
    };

    const instance = await this.instanceRepository.create(createInput);

    try {
      await this.whatsAppManager.createInstance(tenantId, instanceId);

      if (params.usePairingCode && params.phoneNumber) {
        await this.requestPairingCode(tenantId, instanceId, params.phoneNumber);
      }
    } catch (err) {
      this.logger.error({ err, tenantId, instanceId, userId }, 'failed to create runtime instance');
      await this.instanceRepository.deleteById(instance._id).catch(() => undefined);
      throw err;
    }

    this.logger.info({ tenantId, instanceId, userId }, 'instance created');
    return instance;
  }

  async listInstances(tenantId: string): Promise<unknown[]> {
    return this.instanceRepository.findByTenantId(tenantId);
  }

  async getInstance(tenantId: string, instanceId: string): Promise<unknown> {
    return this.requireOwnedInstance(tenantId, instanceId);
  }

  async getQr(tenantId: string, instanceId: string): Promise<{ qr: string | null }> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);
    const runtime = this.whatsAppManager.getInstance(instanceId);
    const qr = runtime?.lastQr ?? null;

    if (qr) {
      await this.instanceRepository.update(instance._id, { lastQr: qr }).catch(() => undefined);
    }

    return { qr };
  }

  async disconnectInstance(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);

    const runtime = this.whatsAppManager.getInstance(instanceId);
    if (!runtime) {
      this.logger.info({ tenantId, instanceId }, 'instance not running, nothing to disconnect');
      return;
    }

    await this.whatsAppManager.disconnectInstance(instanceId);
    await this.instanceRepository.updateStatus(instance._id, 'disconnected');
    this.logger.info({ tenantId, instanceId }, 'instance disconnected');
  }

  async reconnectInstance(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);

    const runtime = await this.whatsAppManager.reconnectInstance(instanceId);
    await this.instanceRepository.updateStatus(instance._id, 'connecting');
    this.logger.info({ tenantId, instanceId, running: !!runtime }, 'instance reconnecting');
  }

  async logoutInstance(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);

    const runtime = this.whatsAppManager.getInstance(instanceId);
    if (runtime) {
      await runtime.transport.logout().catch((err: unknown) => {
        this.logger.warn({ err, tenantId, instanceId }, 'error during logout');
      });
    }

    await this.instanceRepository.updateStatus(instance._id, 'logged_out');
    this.logger.info({ tenantId, instanceId }, 'instance logged out');
  }

  async deleteInstance(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);

    await this.instanceRepository.updateStatus(instance._id, 'deleting');

    const runtime = this.whatsAppManager.getInstance(instanceId);
    if (runtime) {
      await this.whatsAppManager.deleteInstance(instanceId);
    }

    await this.instanceRepository.deleteById(instance._id);
    this.logger.info({ tenantId, instanceId }, 'instance deleted');
  }

  async updateWebhook(
    tenantId: string,
    instanceId: string,
    params: UpdateWebhookParams,
  ): Promise<unknown> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);

    const secret = params.webhookSecret ?? instance.webhookSecret ?? generateWebhookSecret();

    const updated = await this.instanceRepository.update(instance._id, {
      webhookUrl: params.webhookUrl,
      webhookSecret: secret,
    });

    if (!updated) {
      throw new NotFoundError('Instance', instanceId);
    }

    this.logger.info({ tenantId, instanceId }, 'webhook config updated');
    return updated;
  }

  async testWebhook(tenantId: string, instanceId: string): Promise<void> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);
    if (!instance.webhookUrl || !instance.webhookSecret) {
      throw new NotFoundError('Webhook config', instanceId);
    }

    await this.webhookDispatcher.dispatch(
      instance.tenantId,
      instance.instanceId,
      instance.webhookUrl,
      instance.webhookSecret,
      'instance.test',
      {
        instanceId,
        tenantId,
        timestamp: new Date().toISOString(),
      },
    );

    this.logger.info({ tenantId, instanceId }, 'test webhook dispatched');
  }

  async requestPairingCode(
    tenantId: string,
    instanceId: string,
    phoneNumber: string,
  ): Promise<string> {
    const instance = await this.requireOwnedInstance(tenantId, instanceId);

    const runtime = this.whatsAppManager.getInstance(instanceId);
    if (!runtime || !runtime.transport.getSocket()) {
      throw new InstanceNotConnectedError(instanceId);
    }

    const pairingCode = await runtime.transport.requestPairingCode(phoneNumber);
    await this.instanceRepository
      .update(instance._id, {
        pairingCode,
        pairingPhoneNumber: phoneNumber,
      })
      .catch(() => undefined);

    this.logger.info({ tenantId, instanceId, phoneNumber }, 'pairing code requested');
    return pairingCode;
  }

  async getChats(tenantId: string, instanceId: string): Promise<unknown[]> {
    await this.requireOwnedInstance(tenantId, instanceId);
    const runtime = this.requireRunningRuntime(instanceId);
    const socket = runtime.transport.getSocket();
    const chatSocket = socket as unknown as SocketWithChats;
    if (typeof chatSocket.fetchChats !== 'function') {
      this.logger.warn({ instanceId }, 'chat listing not available on this socket version');
      return [];
    }
    const chatList = await chatSocket.fetchChats();
    if (!Array.isArray(chatList)) {
      this.logger.warn({ instanceId }, 'fetchChats did not return a list');
      return [];
    }
    return chatList as unknown[];
  }

  async getGroups(tenantId: string, instanceId: string): Promise<unknown[]> {
    await this.requireOwnedInstance(tenantId, instanceId);
    const runtime = this.requireRunningRuntime(instanceId);
    const socket = runtime.transport.getSocket();
    const groupSocket = socket as unknown as SocketWithGroups;
    if (typeof groupSocket.groupFetchAllParticipating !== 'function') {
      throw new InstanceNotConnectedError(instanceId);
    }
    const groupMetadata = await groupSocket.groupFetchAllParticipating();
    return Object.values(groupMetadata);
  }

  private async requireOwnedInstance(tenantId: string, instanceId: string): Promise<Instance> {
    const instance = await this.instanceRepository.findByInstanceId(instanceId);
    if (!instance || instance.tenantId !== tenantId) {
      throw new InstanceNotFoundError(instanceId);
    }
    return instance;
  }

  private requireRunningRuntime(instanceId: string): RuntimeInstance {
    const runtime = this.whatsAppManager.getInstance(instanceId);
    if (!runtime) {
      throw new InstanceNotConnectedError(instanceId);
    }
    return runtime;
  }
}

interface SocketWithChats {
  fetchChats(): Promise<unknown>;
}

interface SocketWithGroups {
  groupFetchAllParticipating(): Promise<Record<string, unknown>>;
}
