import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MediaStoragePort, StoredMedia } from '../../domain/ports/index.js';
import { config } from '../../config.js';
import { logger } from '../../logger.js';

const MEDIA_DIRNAME = 'media';
const MAX_MEDIA_SIZE = parseByteSize(config.MAX_REQUEST_BODY_SIZE);

const EXTENSION_BY_MIME: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/octet-stream': '.bin',
  'audio/mpeg': '.mp3',
  'audio/ogg': '.ogg',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'text/csv': '.csv',
  'text/plain': '.txt',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
};

function parseByteSize(value: string): number {
  const match = /^(\d+(?:\.\d+)?)\s*([kmgt]?b?)?$/i.exec(value.trim());
  if (!match) return 10 * 1024 * 1024;

  const amount = Number.parseFloat(match[1] ?? '0');
  const unit = (match[2] ?? 'b').toLowerCase();

  const unitFactor: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };

  let factor = unitFactor[unit];
  if (factor === undefined) factor = unitFactor[`${unit}b`] ?? 1;

  return Math.floor(amount * factor);
}

function sanitizeFilename(filename: string): string {
  const basename = path.basename(filename);
  const sanitized = basename.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+|\.+$/g, '');
  return sanitized.slice(0, 100) || 'file';
}

export class MediaStorageError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'MediaStorageError';
  }
}

export class MediaTooLargeError extends MediaStorageError {
  constructor(size: number, maxSize: number) {
    super(`Media file is ${size} bytes which exceeds the ${maxSize} byte limit`, 'MEDIA_TOO_LARGE');
    this.name = 'MediaTooLargeError';
  }
}

export class LocalMediaStorage implements MediaStoragePort {
  private readonly mediaDir: string;
  private readonly urlPrefix = '/media';

  constructor(mediaDir: string = path.resolve(config.DATA_DIR, MEDIA_DIRNAME)) {
    this.mediaDir = mediaDir;
  }

  async save(buffer: Buffer, filename: string, mimeType: string): Promise<StoredMedia> {
    if (buffer.length === 0) {
      throw new MediaStorageError('Cannot store an empty media buffer', 'EMPTY_MEDIA');
    }

    if (buffer.length > MAX_MEDIA_SIZE) {
      throw new MediaTooLargeError(buffer.length, MAX_MEDIA_SIZE);
    }

    await fs.mkdir(this.mediaDir, { recursive: true });

    const base = sanitizeFilename(filename);
    const extension = this.inferExtension(base, mimeType);
    const storedName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${extension}`;

    const absolutePath = path.join(this.mediaDir, storedName);
    await fs.writeFile(absolutePath, buffer);

    const url = `${this.urlPrefix}/${storedName}`;
    logger.info(
      {
        url,
        mimeType,
        size: buffer.length,
      },
      'media stored on local filesystem',
    );

    return { url, mimeType, size: buffer.length };
  }

  async delete(url: string): Promise<void> {
    const safePath = this.toStoredPath(url);
    if (safePath === null) {
      throw new MediaStorageError(`Invalid media url: '${url}'`, 'INVALID_MEDIA_URL');
    }

    try {
      await fs.unlink(safePath);
      logger.info({ url }, 'media deleted from local filesystem');
    } catch (err) {
      if (err instanceof Error && (err as { code?: string }).code === 'ENOENT') {
        logger.debug({ url }, 'media file not found, nothing to delete');
        return;
      }
      throw err;
    }
  }

  private inferExtension(base: string, mimeType: string): string {
    const existing = path.extname(base);
    if (existing.length > 0) return existing.toLowerCase().slice(0, 16);

    const extension = EXTENSION_BY_MIME[mimeType.toLowerCase()];
    return extension ?? '.bin';
  }

  private toStoredPath(url: string): string | null {
    if (!url.startsWith(`${this.urlPrefix}/`)) return null;

    const filename = path.basename(url);
    const resolved = path.resolve(this.mediaDir, filename);
    const mediaRoot = `${path.resolve(this.mediaDir)}${path.sep}`;

    if (!resolved.startsWith(mediaRoot) && resolved !== path.resolve(this.mediaDir)) {
      return null;
    }

    return resolved;
  }
}
