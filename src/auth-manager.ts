/**
 * CCS Remote - Auth file management
 *
 * Reads and manages auth files copied from Windows .ccs folder
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAuthDir } from './config';
import { AuthFile, AccountInfo, AuthStatus, CLIProxyProvider } from './types';

const PROVIDER_PREFIXES: Record<CLIProxyProvider, string> = {
  gemini: 'gemini-',
  codex: 'codex-',
  agy: 'antigravity-',
  qwen: 'qwen-',
  iflow: 'iflow-',
  kiro: 'kiro-',
  ghcp: 'github-copilot-',
};

const ALL_PROVIDERS: CLIProxyProvider[] = ['gemini', 'codex', 'agy', 'qwen', 'iflow', 'kiro', 'ghcp'];

/**
 * Parse provider from auth file name or content
 */
function detectProvider(filename: string, content?: AuthFile): CLIProxyProvider | null {
  // Check by filename prefix
  for (const [provider, prefix] of Object.entries(PROVIDER_PREFIXES)) {
    if (filename.startsWith(prefix)) {
      return provider as CLIProxyProvider;
    }
  }

  // Check by content type field
  if (content?.type) {
    const typeMap: Record<string, CLIProxyProvider> = {
      antigravity: 'agy',
      gemini: 'gemini',
      codex: 'codex',
      qwen: 'qwen',
      iflow: 'iflow',
      kiro: 'kiro',
      copilot: 'ghcp',
    };
    return typeMap[content.type.toLowerCase()] || null;
  }

  return null;
}

/**
 * Check if token is expired
 */
function isTokenExpired(expiredStr?: string): boolean {
  if (!expiredStr) return false;
  try {
    const expiry = new Date(expiredStr);
    return expiry.getTime() < Date.now();
  } catch {
    return false;
  }
}

/**
 * List all auth files in auth directory
 */
export function listAuthFiles(): { filename: string; provider: CLIProxyProvider; account: AccountInfo }[] {
  const authDir = getAuthDir();
  const results: { filename: string; provider: CLIProxyProvider; account: AccountInfo }[] = [];

  if (!fs.existsSync(authDir)) {
    return results;
  }

  const files = fs.readdirSync(authDir).filter((f) => f.endsWith('.json'));

  for (const filename of files) {
    try {
      const filepath = path.join(authDir, filename);
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as AuthFile;
      const provider = detectProvider(filename, content);

      if (provider && content.access_token) {
        results.push({
          filename,
          provider,
          account: {
            id: content.email || filename.replace('.json', ''),
            email: content.email || 'unknown',
            provider,
            projectId: content.project_id,
            isExpired: isTokenExpired(content.expired),
            expiresAt: content.expired,
          },
        });
      }
    } catch {
      // Skip invalid files
    }
  }

  return results;
}

/**
 * Get auth status for all providers
 */
export function getAllAuthStatus(): AuthStatus[] {
  const authFiles = listAuthFiles();
  const statusMap = new Map<CLIProxyProvider, AuthStatus>();

  // Initialize all providers
  for (const provider of ALL_PROVIDERS) {
    statusMap.set(provider, {
      provider,
      authenticated: false,
      accounts: [],
    });
  }

  // Populate with auth files
  for (const { provider, account } of authFiles) {
    const status = statusMap.get(provider)!;
    status.accounts.push(account);
    status.authenticated = true;
    if (!status.defaultAccount) {
      status.defaultAccount = account.id;
    }
  }

  return Array.from(statusMap.values());
}

/**
 * Get auth token for a specific account
 */
export function getAccountToken(provider: CLIProxyProvider, accountId: string): string | null {
  const authDir = getAuthDir();

  if (!fs.existsSync(authDir)) {
    return null;
  }

  const files = fs.readdirSync(authDir).filter((f) => f.endsWith('.json'));
  const prefix = PROVIDER_PREFIXES[provider];

  for (const filename of files) {
    if (!filename.startsWith(prefix)) continue;

    try {
      const filepath = path.join(authDir, filename);
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as AuthFile;

      if (content.email === accountId || filename.includes(accountId.replace(/[@.]/g, '_'))) {
        return content.access_token;
      }
    } catch {
      // Skip
    }
  }

  return null;
}

/**
 * Count total auth files
 */
export function countAuthFiles(): number {
  return listAuthFiles().length;
}

