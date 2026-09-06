import {
  BufferJSON,
  initAuthCreds,
  proto,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataSet,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from '@whiskeysockets/baileys';
import type { AuthKeyCategory } from '../../../domain/entities/index.js';
import { AUTH_KEY_CATEGORIES } from '../../database/models/auth-key.js';
import type { AuthRepository } from '../../../domain/ports/index.js';
import { config } from '../../../config.js';
import { encryptData, decryptData } from '../../../shared/crypto/index.js';
import { logger } from '../../../logger.js';

/**
 * Separator used when composing the internal compound key id. It must never
 * appear inside a raw Baileys key id (pre-key ids are numeric strings, session
 * and sender-key ids are base64/JID strings, app-state ids are hashes).
 */
const KEY_ID_SEPARATOR = '|';

function isSupportedCategory(type: keyof SignalDataTypeMap): type is AuthKeyCategory {
  return (AUTH_KEY_CATEGORIES as string[]).includes(type);
}

/**
 * Serializes a Signal value into a plain JSON-safe object. Buffers and
 * Uint8Arrays become { type: 'Buffer', data } records that survive BSON.
 */
function serialize(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer)) as Record<string, unknown>;
}

/**
 * Deserializes a stored record back into a Signal value, restoring buffers
 * with BufferJSON.reviver.
 */
function deserialize<T>(value: Record<string, unknown> | null | undefined): T | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
  } catch (err) {
    logger.warn({ err }, 'failed to deserialize auth state value');
    return null;
  }
}

function buildCompoundKeyId(category: string, id: string): string {
  return `${category}${KEY_ID_SEPARATOR}${id}`;
}

function extractKeyId(category: string, compoundKeyId: string): string {
  return compoundKeyId.slice(category.length + KEY_ID_SEPARATOR.length);
}

function hasEncryptionKey(): boolean {
  return typeof config.AUTH_ENCRYPTION_KEY === 'string' && config.AUTH_ENCRYPTION_KEY.length > 0;
}

interface EncryptedEnvelope {
  enc: {
    v: number;
    alg: string;
    ct: string;
  };
}

function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj.enc !== 'object' || obj.enc === null) return false;
  const enc = obj.enc as Record<string, unknown>;
  return typeof enc.v === 'number' && typeof enc.ct === 'string';
}

function encryptEnvelope(data: Record<string, unknown>): EncryptedEnvelope {
  const serialized = JSON.stringify(data);
  const ct = encryptData(serialized, config.AUTH_ENCRYPTION_KEY!);
  return { enc: { v: 1, alg: 'aes-256-gcm', ct } };
}

function decryptEnvelope<T>(envelope: EncryptedEnvelope): T | null {
  try {
    const decrypted = decryptData(envelope.enc.ct, config.AUTH_ENCRYPTION_KEY!);
    return JSON.parse(decrypted, BufferJSON.reviver) as T;
  } catch (err) {
    logger.warn({ err }, 'failed to decrypt auth state envelope');
    return null;
  }
}

function maybeEncrypt(data: Record<string, unknown>): Record<string, unknown> {
  if (!hasEncryptionKey()) return data;
  return encryptEnvelope(data) as unknown as Record<string, unknown>;
}

function maybeDecrypt<T>(data: Record<string, unknown>): T | null {
  if (isEncryptedEnvelope(data)) {
    return decryptEnvelope<T>(data);
  }
  return deserialize<T>(data);
}

export interface MongoAuthState {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

/**
 * MongoDB-backed Baileys auth state, a drop-in replacement for
 * useMultiFileAuthState. Every read/write goes through the AuthRepository so
 * the domain layer never touches a persistence implementation.
 */
export async function useMongoAuthState(
  tenantId: string,
  instanceId: string,
  authRepository: AuthRepository,
): Promise<MongoAuthState> {
  const credsDocument = await authRepository.findCreds(tenantId, instanceId);
  const creds: AuthenticationCreds =
    (credsDocument?.creds ? maybeDecrypt<AuthenticationCreds>(credsDocument.creds) : null) ??
    initAuthCreds();

  const keys: SignalKeyStore = {
    get: async <T extends keyof SignalDataTypeMap>(
      type: T,
      ids: string[],
    ): Promise<{ [id: string]: SignalDataTypeMap[T] }> => {
      const result: { [id: string]: SignalDataTypeMap[T] } = {};
      if (!isSupportedCategory(type)) return result;

      const stored = await authRepository.findKeys(tenantId, instanceId, type);
      const byId = new Map<string, Record<string, unknown>>();
      for (const key of stored) {
        byId.set(extractKeyId(type, key.keyId), key.data);
      }

      for (const id of ids) {
        const record = byId.get(id);
        if (record === undefined) continue;
        const value = maybeDecrypt<SignalDataTypeMap[T]>(record);
        if (value === null) continue;

        if (type === 'app-state-sync-key') {
          const converted = proto.Message.AppStateSyncKeyData.fromObject(
            value as unknown as Record<string, unknown>,
          );
          result[id] = converted as unknown as SignalDataTypeMap[T];
          continue;
        }

        result[id] = value;
      }

      return result;
    },

    set: async (data: SignalDataSet): Promise<void> => {
      const categories = Object.keys(data) as Array<keyof SignalDataTypeMap>;
      for (const category of categories) {
        if (!isSupportedCategory(category)) {
          logger.debug(
            { tenantId, instanceId, category },
            'skipping unsupported auth key category',
          );
          continue;
        }

        const entries = data[category] ?? {};
        const upsertEntries: Record<string, Record<string, unknown>> = {};
        const deleteCompoundKeys: string[] = [];

        for (const [id, value] of Object.entries(entries)) {
          const compoundKeyId = buildCompoundKeyId(category, id);
          if (value === null || value === undefined) {
            deleteCompoundKeys.push(compoundKeyId);
          } else {
            const serialized = serialize(value);
            upsertEntries[compoundKeyId] = maybeEncrypt(serialized);
          }
        }

        if (Object.keys(upsertEntries).length > 0) {
          await authRepository.setKeys(tenantId, instanceId, category, upsertEntries);
        }
        for (const compoundKeyId of deleteCompoundKeys) {
          await authRepository.deleteKey(tenantId, instanceId, compoundKeyId);
        }
      }
    },

    clear: async (): Promise<void> => {
      await authRepository.deleteCreds(tenantId, instanceId);
      logger.info({ tenantId, instanceId }, 'auth state cleared');
    },
  };

  const saveCreds = async (): Promise<void> => {
    const serialized = serialize(creds);
    const stored = maybeEncrypt(serialized);
    await authRepository.saveCreds(tenantId, instanceId, stored);
    logger.debug({ tenantId, instanceId }, 'baileys creds persisted');
  };

  return { state: { creds, keys }, saveCreds };
}
