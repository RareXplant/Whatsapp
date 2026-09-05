import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { logger, type Logger } from '../../logger.js';
import { config } from '../../config.js';
import type { User, ApiKey, Tenant } from '../../domain/entities/index.js';
import type {
  ApiKeyRepository,
  TenantRepository,
  UserRepository,
} from '../../domain/ports/index.js';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../shared/errors/index.js';
import { generateApiKey, hashApiKey } from '../../shared/crypto/index.js';

export interface JwtPayload {
  sub: string;
  email: string;
  tenantId: string;
  role: string;
}

export interface AuthServiceOptions {
  userRepository: UserRepository;
  apiKeyRepository: ApiKeyRepository;
  tenantRepository: TenantRepository;
  logger?: Logger;
}

export interface LoginResult {
  token: string;
  user: User;
}

export interface VerifyTokenResult {
  user: User;
  tenant: Tenant;
}

export class AuthService {
  private readonly userRepository: UserRepository;
  private readonly apiKeyRepository: ApiKeyRepository;
  private readonly tenantRepository: TenantRepository;
  private readonly logger: Logger;

  constructor(options: AuthServiceOptions) {
    this.userRepository = options.userRepository;
    this.apiKeyRepository = options.apiKeyRepository;
    this.tenantRepository = options.tenantRepository;
    this.logger = options.logger ?? logger;
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.userRepository.findByEmailGlobal(email);
    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const tenant = await this.tenantRepository.findById(user.tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant', user.tenantId);
    }

    const payload: JwtPayload = {
      sub: user._id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const token = jwt.sign(payload, config.JWT_SECRET, {
      expiresIn: config.JWT_EXPIRES_IN,
    } as jwt.SignOptions);

    this.logger.info({ userId: user._id, tenantId: user.tenantId }, 'user logged in');

    return { token, user };
  }

  async verifyToken(token: string): Promise<VerifyTokenResult> {
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }

    const user = await this.userRepository.findById(decoded.sub);
    if (!user) {
      throw new UnauthorizedError('User no longer exists');
    }

    const tenant = await this.tenantRepository.findById(user.tenantId);
    if (!tenant) {
      throw new NotFoundError('Tenant', user.tenantId);
    }

    return { user, tenant };
  }

  async createApiKey(
    tenantId: string,
    userId: string,
    name: string,
    scopes: string[] = ['*'],
  ): Promise<{ apiKey: unknown; plaintextKey: string }> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundError('User', userId);
    }
    if (user.tenantId !== tenantId) {
      throw new ForbiddenError('User does not belong to the tenant');
    }

    const plaintextKey = generateApiKey();
    const keyHash = hashApiKey(plaintextKey, config.API_KEY_PEPPER);
    const keyPrefix = plaintextKey.slice(0, 12);

    const apiKey = await this.apiKeyRepository.create({
      tenantId,
      userId,
      name,
      keyHash,
      keyPrefix,
      scopes,
      expiresAt: null,
    });

    this.logger.info({ tenantId, userId, keyId: apiKey._id, name }, 'api key created');

    return { apiKey, plaintextKey };
  }

  async deleteApiKey(tenantId: string, id: string): Promise<boolean> {
    const apiKey = await this.apiKeyRepository.findById(id);
    if (!apiKey || apiKey.tenantId !== tenantId) {
      throw new NotFoundError('ApiKey', id);
    }

    const deleted = await this.apiKeyRepository.deleteById(id);
    this.logger.info({ tenantId, keyId: id }, 'api key deleted');
    return deleted;
  }

  async listApiKeys(tenantId: string): Promise<unknown[]> {
    const apiKeys = await this.apiKeyRepository.findByTenantId(tenantId);
    return apiKeys.map((apiKey: ApiKey) => ({
      _id: apiKey._id,
      tenantId: apiKey.tenantId,
      userId: apiKey.userId,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt,
      lastUsedAt: apiKey.lastUsedAt,
      createdAt: apiKey.createdAt,
    }));
  }

  async verifyApiKey(key: string): Promise<unknown> {
    const keyHash = hashApiKey(key, config.API_KEY_PEPPER);
    const apiKey = await this.apiKeyRepository.findByKeyHash(keyHash);
    if (!apiKey) {
      throw new UnauthorizedError('Invalid API key');
    }

    if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedError('API key has expired');
    }

    const now = new Date();
    await this.apiKeyRepository.updateLastUsed(apiKey._id, now).catch((err: unknown) => {
      this.logger.warn({ err, keyId: apiKey._id }, 'failed to update api key lastUsedAt');
    });

    return apiKey;
  }
}
