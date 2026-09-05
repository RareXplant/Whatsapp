export interface AuthCredential {
  _id: string;
  tenantId: string;
  instanceId: string;
  creds: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
