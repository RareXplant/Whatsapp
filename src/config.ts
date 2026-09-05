import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';

function loadDotEnv(): void {
  const envPath = path.resolve(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadDotEnv();

/**
 * Parses boolean environment variables. z.coerce.boolean() uses Boolean() which
 * treats the string "false" as true, so we parse explicitly here.
 */
const boolFromEnv = z.union([z.boolean(), z.string()]).transform((value) => {
  if (typeof value === 'boolean') return value;
  return value.toLowerCase() === 'true';
});

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3333),
  HOST: z.string().default('0.0.0.0'),

  MONGODB_URI: z.string().default('mongodb://localhost:27017/whatsapp-gateway'),
  MONGODB_DB_NAME: z.string().default('whatsapp-gateway'),

  JWT_SECRET: z.string().min(32).default('CHANGE_ME_TO_A_RANDOM_64_CHAR_STRING_FOR_DEVELOPMENT'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  API_KEY_PEPPER: z.string().min(8).default('CHANGE_ME_TO_ANOTHER_RANDOM_STRING_DEV'),

  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:3333'),

  RATE_LIMIT_ENABLED: boolFromEnv.default(true),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900_000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),

  WEBHOOK_TIMEOUT_MS: z.coerce.number().default(10_000),
  WEBHOOK_MAX_RETRIES: z.coerce.number().default(5),
  WEBHOOK_BASE_RETRY_MS: z.coerce.number().default(1_000),
  WEBHOOK_MAX_RETRY_MS: z.coerce.number().default(60_000),

  QR_TTL_SECONDS: z.coerce.number().default(30),

  INSTANCE_STARTUP_CONCURRENCY: z.coerce.number().default(5),
  MAX_RECONNECT_ATTEMPTS: z.coerce.number().default(10),
  MAX_RECONNECT_DELAY_MS: z.coerce.number().default(300_000),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  METRICS_ENABLED: boolFromEnv.default(true),

  MEDIA_STORAGE: z.enum(['local', 's3']).default('local'),
  DATA_DIR: z.string().default('./data'),

  AUTH_ENCRYPTION_KEY: z.string().optional(),

  MAX_REQUEST_BODY_SIZE: z.string().default('10mb'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function loadConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const formatted = parsed.error.format();
    console.error('❌ Invalid environment configuration:');
    for (const [key, value] of Object.entries(formatted)) {
      if (key !== '_errors' && value && typeof value === 'object' && '_errors' in value) {
        console.error(`  ${key}: ${(value as { _errors: string[] })._errors.join(', ')}`);
      }
    }
    process.exit(1);
  }

  return parsed.data;
}

export const config: EnvConfig = loadConfig();
