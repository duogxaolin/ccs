/**
 * CCS Remote - Account Switcher
 * 
 * Manages active accounts per provider and handles account switching
 */

import * as fs from 'fs';
import * as path from 'path';
import { getAuthDir, getDataDir } from './config';
import { CLIProxyProvider, AuthFile, AccountInfo } from './types';

const PROVIDER_PREFIXES: Record<CLIProxyProvider, string> = {
  gemini: 'gemini-',
  codex: 'codex-',
  agy: 'antigravity-',
  qwen: 'qwen-',
  iflow: 'iflow-',
  kiro: 'kiro-',
  ghcp: 'github-copilot-',
};

// In-memory active account tracking
const activeAccounts: Map<CLIProxyProvider, string> = new Map();

// Quota exceeded tracking for auto-switch
const quotaExceededAccounts: Map<string, number> = new Map(); // accountId -> timestamp

/**
 * Get state file path
 */
function getStateFilePath(): string {
  return path.join(getDataDir(), 'account-state.json');
}

/**
 * Load persisted account state
 */
export function loadAccountState(): void {
  const stateFile = getStateFilePath();
  if (fs.existsSync(stateFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as {
        activeAccounts: Record<string, string>;
        quotaExceeded: Record<string, number>;
      };
      
      for (const [provider, accountId] of Object.entries(data.activeAccounts || {})) {
        activeAccounts.set(provider as CLIProxyProvider, accountId);
      }
      
      for (const [accountId, timestamp] of Object.entries(data.quotaExceeded || {})) {
        // Only restore if less than 24 hours old
        if (Date.now() - timestamp < 24 * 60 * 60 * 1000) {
          quotaExceededAccounts.set(accountId, timestamp);
        }
      }
      
      console.log('[account-switcher] Loaded state:', {
        activeAccounts: Object.fromEntries(activeAccounts),
        quotaExceeded: quotaExceededAccounts.size,
      });
    } catch (error) {
      console.error('[account-switcher] Failed to load state:', error);
    }
  }
}

/**
 * Save account state to disk
 */
function saveAccountState(): void {
  const stateFile = getStateFilePath();
  try {
    const data = {
      activeAccounts: Object.fromEntries(activeAccounts),
      quotaExceeded: Object.fromEntries(quotaExceededAccounts),
    };
    fs.writeFileSync(stateFile, JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch (error) {
    console.error('[account-switcher] Failed to save state:', error);
  }
}

/**
 * Get all accounts for a provider
 */
export function getAccountsForProvider(provider: CLIProxyProvider): AccountInfo[] {
  const authDir = getAuthDir();
  if (!fs.existsSync(authDir)) return [];

  const prefix = PROVIDER_PREFIXES[provider];
  const files = fs.readdirSync(authDir).filter(f => f.startsWith(prefix) && f.endsWith('.json'));
  const accounts: AccountInfo[] = [];

  for (const filename of files) {
    try {
      const filepath = path.join(authDir, filename);
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8')) as AuthFile;
      const isExpired = content.expired ? new Date(content.expired).getTime() < Date.now() : false;
      
      accounts.push({
        id: content.email || filename.replace('.json', ''),
        email: content.email || 'unknown',
        provider,
        projectId: content.project_id,
        isExpired,
        expiresAt: content.expired,
      });
    } catch { /* skip invalid files */ }
  }

  return accounts;
}

/**
 * Get active account for a provider
 */
export function getActiveAccount(provider: CLIProxyProvider): AccountInfo | null {
  const accounts = getAccountsForProvider(provider);
  if (accounts.length === 0) return null;

  const activeId = activeAccounts.get(provider);
  if (activeId) {
    const account = accounts.find(a => a.id === activeId || a.email === activeId);
    if (account && !account.isExpired) return account;
  }

  // Return first non-expired account
  return accounts.find(a => !a.isExpired) || accounts[0];
}

/**
 * Set active account for a provider
 */
export function setActiveAccount(provider: CLIProxyProvider, accountId: string): boolean {
  const accounts = getAccountsForProvider(provider);
  const account = accounts.find(a => a.id === accountId || a.email === accountId);
  
  if (!account) return false;
  
  activeAccounts.set(provider, account.id);
  saveAccountState();
  console.log(`[account-switcher] Set active account for ${provider}: ${account.email}`);
  return true;
}

/**
 * Mark account as quota exceeded
 */
export function markQuotaExceeded(provider: CLIProxyProvider, accountId?: string): void {
  const account = accountId || getActiveAccount(provider)?.id;
  if (account) {
    quotaExceededAccounts.set(account, Date.now());
    saveAccountState();
    console.log(`[account-switcher] Marked ${account} as quota exceeded`);
  }
}

/**
 * Check if account is quota exceeded (within last 24 hours)
 */
export function isQuotaExceeded(accountId: string): boolean {
  const timestamp = quotaExceededAccounts.get(accountId);
  if (!timestamp) return false;
  return Date.now() - timestamp < 24 * 60 * 60 * 1000;
}

/**
 * Switch to next available account for a provider
 * Returns the new active account or null if no alternatives
 */
export function switchToNextAccount(provider: CLIProxyProvider): AccountInfo | null {
  const accounts = getAccountsForProvider(provider);
  const currentActive = getActiveAccount(provider);
  
  // Filter out expired and quota-exceeded accounts
  const available = accounts.filter(a => 
    !a.isExpired && 
    !isQuotaExceeded(a.id) &&
    a.id !== currentActive?.id
  );

  if (available.length === 0) {
    console.log(`[account-switcher] No available accounts for ${provider}`);
    return null;
  }

  // Switch to first available
  const nextAccount = available[0];
  activeAccounts.set(provider, nextAccount.id);
  saveAccountState();
  console.log(`[account-switcher] Switched ${provider} to: ${nextAccount.email}`);
  return nextAccount;
}

/**
 * Clear quota exceeded status for all accounts
 */
export function clearQuotaExceeded(): void {
  quotaExceededAccounts.clear();
  saveAccountState();
  console.log('[account-switcher] Cleared all quota exceeded flags');
}

/**
 * Get account switching status
 */
export function getAccountSwitchingStatus(): {
  providers: Record<string, { active: string | null; available: number; quotaExceeded: number }>;
} {
  const providers: Record<string, { active: string | null; available: number; quotaExceeded: number }> = {};
  
  for (const provider of Object.keys(PROVIDER_PREFIXES) as CLIProxyProvider[]) {
    const accounts = getAccountsForProvider(provider);
    const active = getActiveAccount(provider);
    const quotaExceeded = accounts.filter(a => isQuotaExceeded(a.id)).length;
    const available = accounts.filter(a => !a.isExpired && !isQuotaExceeded(a.id)).length;
    
    providers[provider] = {
      active: active?.email || null,
      available,
      quotaExceeded,
    };
  }
  
  return { providers };
}

