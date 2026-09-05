export interface WebhookDispatcherPort {
  dispatch(
    tenantId: string,
    instanceId: string,
    url: string,
    secret: string,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void>;
  retryPending(): Promise<void>;
}
