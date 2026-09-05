export type InstanceStatus =
  | 'created'
  | 'connecting'
  | 'qr_ready'
  | 'pairing_code_ready'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'logged_out'
  | 'error'
  | 'deleting';

export interface Instance {
  _id: string;
  tenantId: string;
  instanceId: string;
  name: string;
  status: InstanceStatus;
  phoneNumber: string | null;
  pushName: string | null;
  profilePictureUrl: string | null;
  platform: string | null;
  connectionState: string | null;
  lastQr: string | null;
  pairingCode: string | null;
  pairingPhoneNumber: string | null;
  webhookUrl: string | null;
  webhookSecret: string | null;
  lastConnectedAt: Date | null;
  lastDisconnectedAt: Date | null;
  lastErrorAt: Date | null;
  reconnectAttempts: number;
  createdAt: Date;
  updatedAt: Date;
}
