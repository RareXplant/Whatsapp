export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} with id '${id}' not found` : `${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, 'CONFLICT', 409, details);
    this.name = 'ConflictError';
  }
}

export class InstanceNotConnectedError extends AppError {
  constructor(instanceId: string) {
    super(`WhatsApp instance '${instanceId}' is not connected`, 'INSTANCE_NOT_CONNECTED', 400, {
      instanceId,
    });
    this.name = 'InstanceNotConnectedError';
  }
}

export class InstanceNotFoundError extends NotFoundError {
  constructor(instanceId: string) {
    super('Instance', instanceId);
    this.name = 'InstanceNotFoundError';
  }
}

export class BaileysConnectionError extends AppError {
  constructor(instanceId: string, reason: string) {
    super(
      `Baileys connection failed for '${instanceId}': ${reason}`,
      'BAILEYS_CONNECTION_ERROR',
      502,
      { instanceId, reason },
    );
    this.name = 'BaileysConnectionError';
  }
}

export class WebhookDeliveryError extends AppError {
  constructor(webhookUrl: string, reason: string) {
    super(`Webhook delivery to '${webhookUrl}' failed: ${reason}`, 'WEBHOOK_DELIVERY_ERROR', 502, {
      webhookUrl,
    });
    this.name = 'WebhookDeliveryError';
  }
}

export class DatabaseError extends AppError {
  constructor(operation: string, reason: string) {
    super(`Database operation '${operation}' failed: ${reason}`, 'DATABASE_ERROR', 500, {
      operation,
    });
    this.name = 'DatabaseError';
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super('Rate limit exceeded', 'RATE_LIMIT_EXCEEDED', 429);
    this.name = 'RateLimitError';
  }
}

export class MessageSendError extends AppError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(`Failed to send message: ${reason}`, 'MESSAGE_SEND_ERROR', 500, details);
    this.name = 'MessageSendError';
  }
}

export class SsrfError extends AppError {
  constructor(url: string) {
    super(`URL '${url}' is blocked for security reasons (SSRF protection)`, 'SSRF_BLOCKED', 400, {
      url,
    });
    this.name = 'SsrfError';
  }
}
