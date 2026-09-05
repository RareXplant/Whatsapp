import { LRUCache } from 'lru-cache';
import type { GroupMetadata } from '@whiskeysockets/baileys';

const MAX_ENTRIES = 1000;
const DEFAULT_TTL_MS = 5 * 60 * 1000;

const cache = new LRUCache<string, GroupMetadata>({
  max: MAX_ENTRIES,
  ttl: DEFAULT_TTL_MS,
});

export function get(jid: string): GroupMetadata | undefined {
  return cache.get(jid);
}

export function set(jid: string, metadata: GroupMetadata): void {
  cache.set(jid, metadata);
}

export function has(jid: string): boolean {
  return cache.has(jid);
}

export function invalidate(jid: string): boolean {
  return cache.delete(jid);
}
