import { proto, type WAMessageKey } from '@whiskeysockets/baileys';
import type { MessageRepository } from '../../domain/ports/index.js';

export type GetMessage = (key: WAMessageKey) => Promise<proto.IMessage | undefined>;

/**
 * Builds the Baileys `getMessage` retry callback. Baileys calls this when it
 * receives a retry request for a message it cannot decrypt; returning the
 * stored message prevents the "waiting for this message" failure mode.
 */
export function createGetMessage(
  messageRepository: MessageRepository,
  tenantId: string,
  instanceId: string,
): GetMessage {
  return async (key: WAMessageKey): Promise<proto.IMessage | undefined> => {
    if (!key.id || !key.remoteJid) return undefined;

    const stored = await messageRepository.findDuplicate(tenantId, instanceId, key.id);
    if (!stored) return undefined;

    if (stored.rawMessage && typeof stored.rawMessage === 'object') {
      return stored.rawMessage as proto.IMessage;
    }

    if (stored.text) return { conversation: stored.text };

    return undefined;
  };
}
