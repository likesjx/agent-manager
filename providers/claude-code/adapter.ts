export interface AdapterContext {
  profileId: string;
}

export interface ProviderAdapter {
  discover(): Promise<unknown>;
  execute(commandId: string, scope: string, args: string[]): Promise<unknown>;
  healthCheck(): Promise<{ ok: boolean; details?: string }>;
  authCheck(): Promise<{ ok: boolean; details?: string }>;
  redact(output: string): string;
}

export const adapterName = "claude-code";
