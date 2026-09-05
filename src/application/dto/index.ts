import { z } from 'zod';

export const CreateInstanceDtoSchema = z.object({
  name: z.string().min(1).max(128),
  webhookUrl: z.string().url().optional().nullable(),
  webhookSecret: z.string().min(16).optional().nullable(),
  usePairingCode: z.boolean().optional().default(false),
  phoneNumber: z.string().min(10).max(15).optional().nullable(),
});
export type CreateInstanceDto = z.infer<typeof CreateInstanceDtoSchema>;

export const SendMessageDtoSchema = z.object({
  to: z.string().min(1),
  text: z.string().min(1).max(4096),
});
export type SendMessageDto = z.infer<typeof SendMessageDtoSchema>;

export const CreateApiKeyDtoSchema = z.object({
  name: z.string().min(1).max(64),
  scopes: z.array(z.string()).optional().default(['*']),
});
export type CreateApiKeyDto = z.infer<typeof CreateApiKeyDtoSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RequestPairingDtoSchema = z.object({
  phoneNumber: z.string().min(10).max(15),
});
export type RequestPairingDto = z.infer<typeof RequestPairingDtoSchema>;

export const UpdateWebhookDtoSchema = z.object({
  webhookUrl: z.string().url(),
  webhookSecret: z.string().min(16).optional().nullable(),
});
export type UpdateWebhookDto = z.infer<typeof UpdateWebhookDtoSchema>;
