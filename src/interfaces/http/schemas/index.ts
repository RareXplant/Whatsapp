import { z } from 'zod';

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1),
  })
  .strict();

export const createApiKeySchema = z
  .object({
    name: z.string().min(1).max(100),
    scopes: z.array(z.string().min(1)).optional(),
  })
  .strict();

export const createInstanceSchema = z
  .object({
    name: z.string().min(1).max(100),
    webhookUrl: z.string().url().optional(),
    webhookSecret: z.string().min(8).optional(),
    usePairingCode: z.boolean().optional(),
    phoneNumber: z.string().optional(),
  })
  .strict();

export const sendMessageSchema = z
  .object({
    to: z.string().min(1),
    text: z.string(),
  })
  .strict();

export const webhookSchema = z
  .object({
    webhookUrl: z.string().url(),
    webhookSecret: z.string().min(8).optional(),
  })
  .strict();

export const requestPairingSchema = z
  .object({
    phoneNumber: z.string().min(1),
  })
  .strict();

export const queryInstanceIdSchema = z.object({
  instanceId: z.string().min(1),
});

export const auditQuerySchema = z.object({
  instanceId: z.string().optional(),
  action: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type CreateInstanceInput = z.infer<typeof createInstanceSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type WebhookInput = z.infer<typeof webhookSchema>;
export type RequestPairingInput = z.infer<typeof requestPairingSchema>;
export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
