export type ProviderChannel = 'email' | 'sms' | 'push';

export interface ProviderSendResult {
  success: boolean;
  simulated: boolean;
  providerMessageId?: string;
  retryable?: boolean;
  error?: string;
  raw?: unknown;
}

export interface NotificationProvider {
  readonly name: string;
  readonly channel: ProviderChannel;
  readonly simulated: boolean;
  configure(config: Record<string, unknown>): void;
  isConfigured(): boolean;
  getStatus(): 'not_configured' | 'configured' | 'verified' | 'degraded' | 'disabled' | 'error';
  send(input: {
    to: string | string[];
    subject?: string;
    body: string;
    template?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProviderSendResult>;
  verify?(): Promise<{ ok: boolean; message?: string }>;
}