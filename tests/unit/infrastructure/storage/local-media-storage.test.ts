import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LocalMediaStorage,
  MediaStorageError,
  MediaTooLargeError,
} from '../../../../src/infrastructure/storage/local-media-storage.js';

const dirs: string[] = [];

function makeStorage(): { storage: LocalMediaStorage; mediaDir: string } {
  const mediaDir = path.join(
    os.tmpdir(),
    `wag-media-test-${process.pid}-${Math.random().toString(36).slice(2)}`,
  );
  dirs.push(mediaDir);
  return { storage: new LocalMediaStorage(mediaDir), mediaDir };
}

afterEach(async () => {
  for (const dir of dirs) {
    await fs.rm(dir, { recursive: true, force: true });
  }
  dirs.length = 0;
});

describe('LocalMediaStorage', () => {
  it('returns the media url without revealing the underlying path', async () => {
    const { storage } = makeStorage();
    const saved = await storage.save(Buffer.from('hello world'), 'photo.jpg', 'image/jpeg');
    expect(saved.url).toMatch(/^\/media\/[0-9]+-[0-9a-f]{16}\.jpg$/);
    expect(saved.url).not.toContain(os.tmpdir());
    expect(saved.mimeType).toBe('image/jpeg');
    expect(saved.size).toBe(Buffer.byteLength('hello world'));
  });

  it('infers an extension from the mime type when the filename has none', async () => {
    const { storage } = makeStorage();
    const saved = await storage.save(Buffer.from('%PDF'), 'report', 'application/pdf');
    expect(saved.url).toMatch(/\.pdf$/);
  });

  it('round-trips a save then read from disk and delete', async () => {
    const { storage, mediaDir } = makeStorage();
    const content = Buffer.from('round trip payload');
    const saved = await storage.save(content, 'file.txt', 'text/plain');

    const filename = saved.url.slice('/media/'.length);
    const stored = await fs.readFile(path.join(mediaDir, filename));
    expect(stored.equals(content)).toBe(true);

    await storage.delete(saved.url);
    await expect(fs.stat(path.join(mediaDir, filename))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects empty buffers', async () => {
    const { storage } = makeStorage();
    await expect(
      storage.save(Buffer.alloc(0), 'empty.bin', 'application/octet-stream'),
    ).rejects.toBeInstanceOf(MediaStorageError);
    await expect(
      storage.save(Buffer.alloc(0), 'empty.bin', 'application/octet-stream'),
    ).rejects.toMatchObject({ code: 'EMPTY_MEDIA' });
  });

  it('rejects buffers larger than the configured max body size', async () => {
    const { storage } = makeStorage();
    const maxSize = 10 * 1024 * 1024;
    const oversized = Buffer.alloc(maxSize + 1, 1);
    await expect(
      storage.save(oversized, 'big.bin', 'application/octet-stream'),
    ).rejects.toBeInstanceOf(MediaTooLargeError);
  });

  it('rejects deleting urls outside the /media prefix', async () => {
    const { storage } = makeStorage();
    await expect(storage.delete('https://evil.example/stolen')).rejects.toMatchObject({
      code: 'INVALID_MEDIA_URL',
    });
  });

  it('rejects deleting urls that resolve outside the media directory', async () => {
    const { storage } = makeStorage();
    await expect(storage.delete('/media/..')).rejects.toMatchObject({
      code: 'INVALID_MEDIA_URL',
    });
  });

  it('ignores ENOENT when deleting a missing file', async () => {
    const { storage } = makeStorage();
    await expect(storage.delete('/media/does-not-exist-123.bin')).resolves.toBeUndefined();
  });
});
