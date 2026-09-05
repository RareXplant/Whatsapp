import { Mutex } from 'async-mutex';
import { DisconnectReason } from '@whiskeysockets/baileys';
import { config } from '../../config.js';
import { logger as sharedLogger, type Logger } from '../../logger.js';
import { BaileysTransport, type BaileysTransportOptions } from './BaileysTransport.js';
import type {
  AuthRepository,
  WhatsAppConnectedPayload,
  WhatsAppCredentialsUpdatedPayload,
  WhatsAppDisconnectedPayload,
  WhatsAppLoggedOutPayload,
  WhatsAppMessageReceivedPayload,
  WhatsAppMessageUpdatedPayload,
  WhatsAppPairingCodePayload,
  WhatsAppQrPayload,
} from '../../domain/ports/index.js';

/** Base delay for the exponential reconnect backoff (1s, 2s, 4s, ...). */
const BASE_RECONNECT_DELAY_MS = 1_000;
/** Upper bound for the random jitter added to each backoff delay. */
const RECONNECT_JITTER_MS = 1_000;

export interface RuntimeInstance {
  transport: BaileysTransport;
  tenantId: string;
  instanceId: string;
  flags: {
    /** Socket must not (auto-)reconnect anymore. */
    stopped: boolean;
    /** A connection attempt is currently in progress. */
    connecting: boolean;
    /** The instance is being deleted; no reconnect should be scheduled. */
    deleting: boolean;
  };
  lastQr: string | null;
  lastPairingCode: string | null;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
}

/** Forwards a runtime event to Socket.IO (injected by the realtime hub). */
export type SendRuntimeEvent = (event: string, payload: Record<string, unknown>) => void;

export type TransportFactory = (options: BaileysTransportOptions) => BaileysTransport;

export interface WhatsAppManagerOptions {
  authRepository: AuthRepository;
  sendRuntimeEvent?: SendRuntimeEvent;
  onMessageReceived?: (payload: WhatsAppMessageReceivedPayload) => Promise<void> | void;
  onMessageUpdated?: (payload: WhatsAppMessageUpdatedPayload) => Promise<void> | void;
  logger?: Logger;
  transportFactory?: TransportFactory;
}

const noopSendRuntimeEvent: SendRuntimeEvent = (event, payload) => {
  const instanceId = 'instanceId' in payload ? payload.instanceId : undefined;
  sharedLogger.debug({ event, instanceId }, 'runtime event');
};

export class WhatsAppManager {
  private readonly instances = new Map<string, RuntimeInstance>();
  private readonly instanceMutexes = new Map<string, Mutex>();
  private readonly options: Required<Omit<WhatsAppManagerOptions, 'authRepository'>> & {
    authRepository: AuthRepository;
  };

  constructor(options: WhatsAppManagerOptions) {
    this.options = {
      authRepository: options.authRepository,
      sendRuntimeEvent: options.sendRuntimeEvent ?? noopSendRuntimeEvent,
      onMessageReceived: options.onMessageReceived ?? (() => undefined),
      onMessageUpdated: options.onMessageUpdated ?? (() => undefined),
      logger: options.logger ?? sharedLogger,
      transportFactory: options.transportFactory ?? ((opts) => new BaileysTransport(opts)),
    };
  }

  async createInstance(tenantId: string, instanceId: string): Promise<RuntimeInstance> {
    const mutex = this.getMutex(instanceId);
    return mutex.runExclusive(async () => {
      const existing = this.instances.get(instanceId);
      if (existing) {
        if (existing.transport.isConnected()) return existing;
        existing.flags.stopped = false;
        existing.flags.deleting = false;
        await existing.transport.connect().catch((err: unknown) => {
          this.options.logger.error({ err, instanceId }, 'transport connect failed');
          throw err;
        });
        return existing;
      }

      const transport = this.options.transportFactory({
        tenantId,
        instanceId,
        authRepository: this.options.authRepository,
        logger: this.options.logger,
      });

      const runtime: RuntimeInstance = {
        transport,
        tenantId,
        instanceId,
        flags: { stopped: false, connecting: true, deleting: false },
        lastQr: null,
        lastPairingCode: null,
        reconnectAttempts: 0,
        reconnectTimer: null,
      };

      this.instances.set(instanceId, runtime);
      this.bindRuntimeEvents(runtime);

      try {
        await transport.connect();
      } catch (err) {
        await transport.disconnect().catch(() => undefined);
        this.instances.delete(instanceId);
        throw err;
      }

      return runtime;
    });
  }

  async disconnectInstance(instanceId: string): Promise<boolean> {
    const mutex = this.getMutex(instanceId);
    return mutex.runExclusive(async () => {
      const runtime = this.getInstance(instanceId);
      if (!runtime) return false;

      runtime.flags.stopped = true;
      this.clearReconnectTimer(runtime);
      await runtime.transport.disconnect();
      return true;
    });
  }

  async deleteInstance(instanceId: string): Promise<boolean> {
    const mutex = this.getMutex(instanceId);
    return mutex.runExclusive(async () => {
      const runtime = this.getInstance(instanceId);
      if (!runtime) return false;

      runtime.flags.stopped = true;
      runtime.flags.deleting = true;
      this.clearReconnectTimer(runtime);
      await runtime.transport.disconnect();

      this.instances.delete(instanceId);
      this.instanceMutexes.delete(instanceId);
      return true;
    });
  }

  async reconnectInstance(instanceId: string): Promise<RuntimeInstance | null> {
    const runtime = this.getInstance(instanceId);
    if (!runtime) return null;

    this.clearReconnectTimer(runtime);
    runtime.flags.stopped = false;
    runtime.flags.deleting = false;
    runtime.reconnectAttempts = 0;

    await this.createInstance(runtime.tenantId, instanceId);
    return this.getInstance(instanceId) ?? null;
  }

  getInstance(instanceId: string): RuntimeInstance | undefined {
    return this.instances.get(instanceId);
  }

  getAllInstances(): RuntimeInstance[] {
    return [...this.instances.values()];
  }

  isRunning(instanceId: string): boolean {
    const runtime = this.instances.get(instanceId);
    return runtime !== undefined && runtime.transport.getSocket() !== null;
  }

  async shutdown(): Promise<void> {
    const runtimes = this.getAllInstances();
    this.instances.clear();

    for (const runtime of runtimes) {
      runtime.flags.stopped = true;
      runtime.flags.deleting = true;
      this.clearReconnectTimer(runtime);
    }

    await Promise.allSettled(
      runtimes.map(async (runtime) => {
        try {
          await runtime.transport.disconnect();
        } catch (err) {
          this.options.logger.error(
            { err, instanceId: runtime.instanceId },
            'disconnect failed during shutdown',
          );
        }
      }),
    );

    this.instanceMutexes.clear();
  }

  private bindRuntimeEvents(runtime: RuntimeInstance): void {
    const { transport, instanceId } = runtime;

    transport.on('qr', (payload: WhatsAppQrPayload) => {
      runtime.lastQr = payload.qr;
      this.emitRuntimeEvent('instance.qr', {
        instanceId,
        qr: payload.qr,
        ttl: payload.ttl,
      });
    });

    transport.on('pairingCode', (payload: WhatsAppPairingCodePayload) => {
      runtime.lastPairingCode = payload.pairingCode;
      this.emitRuntimeEvent('instance.pairingCode', {
        instanceId,
        pairingCode: payload.pairingCode,
      });
    });

    transport.on('connected', (payload: WhatsAppConnectedPayload) => {
      runtime.flags.connecting = false;
      this.clearReconnectTimer(runtime);
      runtime.reconnectAttempts = 0;
      this.emitRuntimeEvent('instance.connected', {
        instanceId,
        phoneNumber: payload.phoneNumber,
        pushName: payload.pushName,
        platform: payload.platform,
      });
    });

    transport.on('disconnected', (payload: WhatsAppDisconnectedPayload) => {
      this.handleDisconnected(runtime, payload);
    });

    transport.on('loggedOut', (_payload: WhatsAppLoggedOutPayload) => {
      runtime.flags.stopped = true;
      runtime.flags.connecting = false;
      this.clearReconnectTimer(runtime);
      this.emitRuntimeEvent('instance.loggedOut', { instanceId });
    });

    transport.on('messageReceived', (payload: WhatsAppMessageReceivedPayload) => {
      Promise.resolve(this.options.onMessageReceived(payload)).catch((err: unknown) => {
        this.options.logger.error(
          { err, instanceId: payload.instanceId },
          'incoming message handler failed',
        );
      });
      this.emitRuntimeEvent('message.received', payload as unknown as Record<string, unknown>);
    });

    transport.on('messageUpdated', (payload: WhatsAppMessageUpdatedPayload) => {
      Promise.resolve(this.options.onMessageUpdated(payload)).catch((err: unknown) => {
        this.options.logger.error(
          { err, instanceId: payload.instanceId },
          'message update handler failed',
        );
      });
      this.emitRuntimeEvent('message.updated', payload as unknown as Record<string, unknown>);
    });

    transport.on('credentialsUpdated', (_payload: WhatsAppCredentialsUpdatedPayload) => {
      this.emitRuntimeEvent('creds.updated', { instanceId });
    });
  }

  private handleDisconnected(runtime: RuntimeInstance, payload: WhatsAppDisconnectedPayload): void {
    runtime.flags.connecting = false;
    this.emitRuntimeEvent('instance.disconnected', {
      instanceId: runtime.instanceId,
      reason: payload.reason,
    });

    if (runtime.flags.stopped || runtime.flags.deleting) return;

    if (Number(payload.reason) === DisconnectReason.loggedOut) {
      runtime.flags.stopped = true;
      this.clearReconnectTimer(runtime);
      return;
    }

    this.scheduleReconnect(runtime);
  }

  private scheduleReconnect(runtime: RuntimeInstance): void {
    if (runtime.flags.stopped || runtime.flags.deleting) return;

    if (runtime.reconnectAttempts >= config.MAX_RECONNECT_ATTEMPTS) {
      runtime.flags.connecting = false;
      this.options.logger.warn(
        { instanceId: runtime.instanceId, attempts: runtime.reconnectAttempts },
        'max reconnect attempts reached',
      );
      return;
    }

    const exponential = BASE_RECONNECT_DELAY_MS * 2 ** runtime.reconnectAttempts;
    const capped = Math.min(exponential, config.MAX_RECONNECT_DELAY_MS);
    const jitterFloor = Math.max(100, capped * 0.25);
    const jitter = Math.floor(Math.random() * Math.min(RECONNECT_JITTER_MS, jitterFloor));
    const delayMs = capped + jitter;

    runtime.reconnectAttempts += 1;
    runtime.flags.connecting = true;

    this.options.logger.warn(
      { instanceId: runtime.instanceId, attempt: runtime.reconnectAttempts, delayMs },
      'scheduling reconnect',
    );

    runtime.reconnectTimer = setTimeout(() => {
      runtime.reconnectTimer = null;
      void this.reconnectScheduled(runtime);
    }, delayMs);
  }

  private async reconnectScheduled(runtime: RuntimeInstance): Promise<void> {
    try {
      await this.createInstance(runtime.tenantId, runtime.instanceId);
    } catch (err) {
      this.options.logger.error(
        { err, instanceId: runtime.instanceId },
        'reconnect attempt failed',
      );
      const instance = this.getInstance(runtime.instanceId);
      if (instance && !instance.flags.stopped && !instance.flags.deleting) {
        this.scheduleReconnect(instance);
      }
    }
  }

  private clearReconnectTimer(runtime: RuntimeInstance): void {
    if (runtime.reconnectTimer !== null) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }
  }

  private emitRuntimeEvent(event: string, payload: Record<string, unknown>): void {
    this.options.sendRuntimeEvent(event, payload);
  }

  private getMutex(instanceId: string): Mutex {
    let mutex = this.instanceMutexes.get(instanceId);
    if (!mutex) {
      mutex = new Mutex();
      this.instanceMutexes.set(instanceId, mutex);
    }
    return mutex;
  }
}
