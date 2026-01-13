/**
 * CCS Remote - Token Refresh Service
 * 
 * Automatically refreshes OAuth tokens before they expire
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAuthDir } from './config';
import { AuthFile, CLIProxyProvider } from './types';

// Refresh token endpoint configurations by provider
const REFRESH_ENDPOINTS: Record<CLIProxyProvider, { url: string; clientId?: string } | null> = {
  gemini: { url: 'https://oauth2.googleapis.com/token' },
  codex: { url: 'https://oauth2.googleapis.com/token' },
  agy: { url: 'https://oauth2.googleapis.com/token' },
  qwen: null, // Qwen uses different auth mechanism
  iflow: null, // iFlow uses different auth
  kiro: { url: 'https://oauth2.googleapis.com/token' },
  ghcp: null, // GitHub Copilot uses different auth
};

interface RefreshResult {
  success: boolean;
  email: string;
  provider: CLIProxyProvider;
  error?: string;
  newExpiresAt?: string;
}

/**
 * Refresh a single OAuth token
 */
async function refreshToken(authFile: AuthFile, provider: CLIProxyProvider): Promise<{
  success: boolean;
  newToken?: AuthFile;
  error?: string;
}> {
  const endpoint = REFRESH_ENDPOINTS[provider];
  if (!endpoint) {
    return { success: false, error: 'Provider does not support token refresh' };
  }

  if (!authFile.refresh_token) {
    return { success: false, error: 'No refresh token available' };
  }

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: authFile.refresh_token,
        ...(endpoint.clientId && { client_id: endpoint.clientId }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { success: false, error: `Refresh failed: ${response.status} - ${errorText}` };
    }

    const data = await response.json() as {
      access_token: string;
      expires_in: number;
      refresh_token?: string;
    };

    const now = Date.now();
    const expiresAt = new Date(now + data.expires_in * 1000);

    const newToken: AuthFile = {
      ...authFile,
      access_token: data.access_token,
      expires_in: data.expires_in,
      expired: expiresAt.toISOString(),
      timestamp: now,
      refresh_token: data.refresh_token || authFile.refresh_token,
    };

    return { success: true, newToken };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Check if token needs refresh (expires within threshold)
 */
function needsRefresh(authFile: AuthFile, thresholdMinutes = 30): boolean {
  if (!authFile.expired) return false;
  
  try {
    const expiresAt = new Date(authFile.expired).getTime();
    const thresholdMs = thresholdMinutes * 60 * 1000;
    return expiresAt - Date.now() < thresholdMs;
  } catch {
    return false;
  }
}

/**
 * Get all auth files with their providers
 */
function getAllAuthFiles(): { filepath: string; content: AuthFile; provider: CLIProxyProvider }[] {
  const authDir = getAuthDir();
  if (!fs.existsSync(authDir)) return [];

  const PROVIDER_PREFIXES: Record<CLIProxyProvider, string> = {
    gemini: 'gemini-', codex: 'codex-', agy: 'antigravity-',
    qwen: 'qwen-', iflow: 'iflow-', kiro: 'kiro-', ghcp: 'github-copilot-',
  };

  const files = fs.readdirSync(authDir).filter(f => f.endsWith('.json'));
  const results: { filepath: string; content: AuthFile; provider: CLIProxyProvider }[] = [];

  for (const filename of files) {
    try {
      const filepath = path.join(authDir, filename);
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as AuthFile;
      
      for (const [provider, prefix] of Object.entries(PROVIDER_PREFIXES)) {
        if (filename.startsWith(prefix)) {
          results.push({ filepath, content, provider: provider as CLIProxyProvider });
          break;
        }
      }
    } catch { /* skip invalid files */ }
  }

  return results;
}

/**
 * Refresh all tokens that need refreshing
 */
export async function refreshAllTokens(thresholdMinutes = 30): Promise<RefreshResult[]> {
  const authFiles = getAllAuthFiles();
  const results: RefreshResult[] = [];

  for (const { filepath, content, provider } of authFiles) {
    if (!needsRefresh(content, thresholdMinutes)) continue;

    console.log(`[token-refresh] Refreshing token for ${content.email} (${provider})...`);
    const result = await refreshToken(content, provider);

    if (result.success && result.newToken) {
      // Save updated token
      fs.writeFileSync(filepath, JSON.stringify(result.newToken, null, 2), { mode: 0o600 });
      results.push({
        success: true, email: content.email, provider,
        newExpiresAt: result.newToken.expired,
      });
      console.log(`[token-refresh] Successfully refreshed ${content.email}`);
    } else {
      results.push({ success: false, email: content.email, provider, error: result.error });
      console.warn(`[token-refresh] Failed to refresh ${content.email}: ${result.error}`);
    }
  }

  return results;
}

/**
 * Get token expiration status for all accounts
 */
export function getTokenExpirationStatus(): {
  email: string; provider: CLIProxyProvider; expiresAt: string | null;
  isExpired: boolean; expiresInMinutes: number | null;
}[] {
  return getAllAuthFiles().map(({ content, provider }) => {
    const expiresAt = content.expired || null;
    let isExpired = false;
    let expiresInMinutes: number | null = null;

    if (expiresAt) {
      const expiresTime = new Date(expiresAt).getTime();
      isExpired = expiresTime < Date.now();
      expiresInMinutes = isExpired ? 0 : Math.floor((expiresTime - Date.now()) / 60000);
    }

    return { email: content.email, provider, expiresAt, isExpired, expiresInMinutes };
  });
}

let refreshInterval: NodeJS.Timeout | null = null;

/**
 * Start automatic token refresh service
 */
export function startTokenRefreshService(intervalMinutes = 15): void {
  if (refreshInterval) return;
  
  console.log(`[token-refresh] Starting auto-refresh service (every ${intervalMinutes} minutes)`);
  
  // Initial refresh
  refreshAllTokens().catch(console.error);
  
  // Schedule periodic refresh
  refreshInterval = setInterval(() => {
    refreshAllTokens().catch(console.error);
  }, intervalMinutes * 60 * 1000);
}

/**
 * Stop automatic token refresh service
 */
export function stopTokenRefreshService(): void {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('[token-refresh] Stopped auto-refresh service');
  }
}

