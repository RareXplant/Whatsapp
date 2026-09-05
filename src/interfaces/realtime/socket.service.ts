import { Server as SocketIOServer, type Socket } from 'socket.io';
import type { Server } from 'node:http';
import { config } from '../../config.js';
import { logger, type Logger } from '../../logger.js';
import type { InstanceRepository } from '../../domain/ports/instance-repository.js';
import type { AuthService } from '../../application/services/auth.service.js';
import { UnauthorizedError } from '../../shared/errors/index.js';

export interface SocketServiceOptions {
  authService: AuthService;
  instanceRepository: InstanceRepository;
  logger?: Logger;
}

/**
 * Authenticated realtime hub. Every connection is authenticated with the same
 * JWT the HTTP API uses. Connections are grouped into `tenant:{tenantId}`
 * rooms and instance-scoped `tenant:{tenantId}:instance:{instanceId}` rooms so
 * that no QR code, pairing code or message ever leaks across tenants.
 */
export class SocketService {
  private readonly authService: AuthService;
  private readonly instanceRepository: InstanceRepository;
  private readonly logger: Logger;
  private io: SocketIOServer | null = null;

  constructor(options: SocketServiceOptions) {
    this.authService = options.authService;
    this.instanceRepository = options.instanceRepository;
    this.logger = options.logger ?? logger;
  }

  init(httpServer: Server): SocketIOServer {
    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.CORS_ORIGINS.split(',')
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
        credentials: true,
      },
      serveClient: false,
    });

    this.io.use(async (socket, next) => {
      try {
        const token = extractToken(socket);
        if (!token) {
          next(new UnauthorizedError('Socket authentication required'));
          return;
        }

        const identity = await this.authService.verifyToken(token);
        if (!identity?.user || !identity.user.tenantId) {
          next(new UnauthorizedError());
          return;
        }

        (socket.data as Record<string, unknown>).tenantId = identity.user.tenantId;
        (socket.data as Record<string, unknown>).userId = identity.user._id;
        (socket.data as Record<string, unknown>).role = identity.user.role;
        next();
      } catch (err) {
        this.logger.warn({ err }, 'socket authentication failed');
        next(new UnauthorizedError());
      }
    });

    this.io.on('connection', (socket) => {
      this.handleConnection(socket);
    });

    return this.io;
  }

  /**
   * Emits an event to the tenant room and, when an instance is part of the
   * payload, to the tenant+instance room as well.
   */
  emitToTenant(tenantId: string, event: string, payload: Record<string, unknown>): void {
    if (!this.io) return;
    this.io.to(`tenant:${tenantId}`).emit(event, payload);
    const instanceId = payload.instanceId;
    if (typeof instanceId === 'string' && instanceId.length > 0) {
      this.io.to(`tenant:${tenantId}:instance:${instanceId}`).emit(event, payload);
    }
  }

  emitToInstance(
    tenantId: string,
    instanceId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    if (!this.io) return;
    this.io.to(`tenant:${tenantId}:instance:${instanceId}`).emit(event, payload);
  }

  /**
   * Builds the event forwarder that the WhatsAppManager calls for every
   * runtime event. The manager passes opaque event names + payload, we resolve
   * which tenant it belongs to and route it securely into that tenant's room.
   */
  createRuntimeEventForwarder(
    instanceTenantResolver: (instanceId: string) => Promise<string | null>,
  ) {
    return (event: string, payload: Record<string, unknown>): void => {
      const instanceId = payload.instanceId;
      if (typeof instanceId !== 'string' || instanceId.length === 0) return;

      void (async () => {
        const tenantId = await instanceTenantResolver(instanceId);
        if (!tenantId) return;
        this.emitToTenant(tenantId, event, payload);
      })().catch((err: unknown) => {
        this.logger.error({ err, instanceId }, 'failed to forward runtime event');
      });
    };
  }

  shutdown(): void {
    if (this.io) {
      this.io.close();
      this.io = null;
    }
  }

  private handleConnection(socket: Socket): void {
    const tenantId = (socket.data as Record<string, unknown>).tenantId as string | undefined;
    if (!tenantId) {
      socket.disconnect(true);
      return;
    }

    socket.join(`tenant:${tenantId}`);
    this.logger.info({ tenantId, socketId: socket.id }, 'socket connected');

    socket.on(
      'subscribe-instance',
      async (instanceId: string, ack?: (response: { ok: boolean; error?: string }) => void) => {
        try {
          if (typeof instanceId !== 'string' || instanceId.length === 0) {
            ack?.({ ok: false, error: 'invalid instance id' });
            return;
          }

          const instance = await this.instanceRepository.findByInstanceId(instanceId);
          if (!instance || instance.tenantId !== tenantId) {
            ack?.({ ok: false, error: 'instance not found' });
            return;
          }

          socket.join(`tenant:${tenantId}:instance:${instanceId}`);
          ack?.({ ok: true });
        } catch (err) {
          this.logger.error({ err, instanceId, tenantId }, 'failed to subscribe to instance room');
          ack?.({ ok: false, error: 'internal error' });
        }
      },
    );

    socket.on(
      'unsubscribe-instance',
      (instanceId: string, ack?: (response: { ok: boolean }) => void) => {
        if (typeof instanceId === 'string') {
          socket.leave(`tenant:${tenantId}:instance:${instanceId}`);
        }
        ack?.({ ok: true });
      },
    );

    socket.on('disconnect', () => {
      this.logger.info({ tenantId, socketId: socket.id }, 'socket disconnected');
    });
  }
}

function extractToken(socket: Socket): string | null {
  const handshakeAuth = socket.handshake.auth as { token?: unknown } | undefined;
  if (handshakeAuth?.token && typeof handshakeAuth.token === 'string') {
    return handshakeAuth.token;
  }

  const headers = socket.handshake.headers as Record<string, unknown>;
  const authorization = headers.authorization;
  if (typeof authorization === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
    if (match) return match[1];
  }

  return null;
}
