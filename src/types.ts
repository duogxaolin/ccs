/**
 * CCS Remote - Type definitions
 */

export type CLIProxyProvider = 'gemini' | 'codex' | 'agy' | 'qwen' | 'iflow' | 'kiro' | 'ghcp';

export interface AuthFile {
  access_token: string;
  email: string;
  expired: string;
  expires_in: number;
  project_id?: string;
  refresh_token: string;
  timestamp: number;
  type: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  apiKey: string;
  managementKey: string;
  cliproxyPort: number;
  corsOrigins: string[];
}

export interface AccountInfo {
  id: string;
  email: string;
  provider: CLIProxyProvider;
  projectId?: string;
  isExpired: boolean;
  expiresAt?: string;
}

export interface AuthStatus {
  provider: CLIProxyProvider;
  authenticated: boolean;
  accounts: AccountInfo[];
  defaultAccount?: string;
}

export interface ProxyStats {
  totalRequests: number;
  successCount: number;
  failureCount: number;
  tokens: {
    input: number;
    output: number;
    total: number;
  };
  requestsByProvider: Record<string, number>;
  collectedAt: string;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  cliproxy: boolean;
  authFilesCount: number;
  uptime: number;
  version: string;
}

