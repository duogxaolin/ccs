/**
 * CCS Remote - API Routes
 */

import { Router, Request, Response } from 'express';
import { loadConfig, getAuthDir, getCliproxyDir } from './config';
import { getAllAuthStatus, listAuthFiles, countAuthFiles } from './auth-manager';
import {
  isProxyRunning,
  getProxyStatus,
  startProxy,
  stopProxy,
  isBinaryInstalled,
} from './cliproxy-manager';
import {
  refreshAllTokens,
  getTokenExpirationStatus,
  startTokenRefreshService,
  stopTokenRefreshService,
} from './token-refresh';
import {
  getActiveAccount,
  setActiveAccount,
  getAccountsForProvider,
  getAccountSwitchingStatus,
  switchToNextAccount,
  clearQuotaExceeded,
} from './account-switcher';
import { HealthStatus, ProxyStats, CLIProxyProvider } from './types';

const router = Router();
const startTime = Date.now();

/**
 * Middleware to verify API key
 */
function requireApiKey(req: Request, res: Response, next: () => void): void {
  const config = loadConfig();
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== config.apiKey && token !== config.managementKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  next();
}

/**
 * GET /api/health - Health check
 */
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const cliproxyRunning = await isProxyRunning();
    const authFilesCount = countAuthFiles();

    const status: HealthStatus = {
      status: cliproxyRunning ? 'healthy' : authFilesCount > 0 ? 'degraded' : 'unhealthy',
      cliproxy: cliproxyRunning,
      authFilesCount,
      uptime: Math.floor((Date.now() - startTime) / 1000),
      version: '1.0.0',
    };

    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/auth/status - Get auth status for all providers
 */
router.get('/auth/status', requireApiKey, (_req: Request, res: Response) => {
  try {
    const statuses = getAllAuthStatus();
    res.json({ providers: statuses });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/auth/accounts - List all auth accounts
 */
router.get('/auth/accounts', requireApiKey, (_req: Request, res: Response) => {
  try {
    const accounts = listAuthFiles();
    res.json({ accounts });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/cliproxy/status - Get CLIProxy status
 */
router.get('/cliproxy/status', requireApiKey, async (_req: Request, res: Response) => {
  try {
    const running = await isProxyRunning();
    const status = getProxyStatus();
    const config = loadConfig();

    res.json({
      running,
      pid: status.pid,
      port: config.cliproxyPort,
      binaryInstalled: isBinaryInstalled(),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/start - Start CLIProxy
 */
router.post('/cliproxy/start', requireApiKey, async (_req: Request, res: Response) => {
  try {
    const success = await startProxy();
    res.json({ success, message: success ? 'CLIProxy started' : 'Failed to start CLIProxy' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/cliproxy/stop - Stop CLIProxy
 */
router.post('/cliproxy/stop', requireApiKey, (_req: Request, res: Response) => {
  try {
    const success = stopProxy();
    res.json({ success, message: success ? 'CLIProxy stopped' : 'Failed to stop CLIProxy' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/config - Get current configuration (masked)
 */
router.get('/config', requireApiKey, (_req: Request, res: Response) => {
  try {
    const config = loadConfig();
    res.json({
      port: config.port,
      host: config.host,
      dataDir: config.dataDir,
      cliproxyPort: config.cliproxyPort,
      corsOrigins: config.corsOrigins,
      // Mask sensitive values
      apiKey: '***' + config.apiKey.slice(-4),
      managementKey: '***' + config.managementKey.slice(-4),
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/paths - Get configured paths (for debugging)
 */
router.get('/paths', requireApiKey, (_req: Request, res: Response) => {
  res.json({
    authDir: getAuthDir(),
    cliproxyDir: getCliproxyDir(),
  });
});

// ============================================
// Token Refresh Endpoints
// ============================================

/**
 * GET /api/tokens/status - Get token expiration status for all accounts
 */
router.get('/tokens/status', requireApiKey, (_req: Request, res: Response) => {
  try {
    const status = getTokenExpirationStatus();
    const expiringSoon = status.filter(t => t.expiresInMinutes !== null && t.expiresInMinutes < 60);
    const expired = status.filter(t => t.isExpired);

    res.json({
      tokens: status,
      summary: {
        total: status.length,
        expired: expired.length,
        expiringSoon: expiringSoon.length,
        healthy: status.length - expired.length - expiringSoon.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/tokens/refresh - Manually trigger token refresh
 */
router.post('/tokens/refresh', requireApiKey, async (_req: Request, res: Response) => {
  try {
    const results = await refreshAllTokens(0); // Refresh all regardless of expiry
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    res.json({
      success: failureCount === 0,
      message: `Refreshed ${successCount} tokens, ${failureCount} failed`,
      results,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/tokens/auto-refresh/start - Start automatic token refresh service
 */
router.post('/tokens/auto-refresh/start', requireApiKey, (req: Request, res: Response) => {
  try {
    const intervalMinutes = req.body?.intervalMinutes || 15;
    startTokenRefreshService(intervalMinutes);
    res.json({ success: true, message: `Auto-refresh started (every ${intervalMinutes} minutes)` });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/tokens/auto-refresh/stop - Stop automatic token refresh service
 */
router.post('/tokens/auto-refresh/stop', requireApiKey, (_req: Request, res: Response) => {
  try {
    stopTokenRefreshService();
    res.json({ success: true, message: 'Auto-refresh stopped' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================
// Quota Monitoring Endpoints
// ============================================

// In-memory stats storage (persisted via CLIProxy's own stats)
const requestStats: ProxyStats = {
  totalRequests: 0,
  successCount: 0,
  failureCount: 0,
  tokens: { input: 0, output: 0, total: 0 },
  requestsByProvider: {},
  collectedAt: new Date().toISOString(),
};

/**
 * Increment request stats (called from proxy handler)
 */
export function incrementRequestStats(provider: string, success: boolean, inputTokens = 0, outputTokens = 0): void {
  requestStats.totalRequests++;
  if (success) requestStats.successCount++;
  else requestStats.failureCount++;

  requestStats.tokens.input += inputTokens;
  requestStats.tokens.output += outputTokens;
  requestStats.tokens.total += inputTokens + outputTokens;

  requestStats.requestsByProvider[provider] = (requestStats.requestsByProvider[provider] || 0) + 1;
  requestStats.collectedAt = new Date().toISOString();
}

/**
 * GET /api/stats - Get proxy usage statistics
 */
router.get('/stats', requireApiKey, (_req: Request, res: Response) => {
  try {
    res.json(requestStats);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/quota - Get quota information (attempts to fetch from CLIProxy)
 */
router.get('/quota', requireApiKey, async (_req: Request, res: Response) => {
  try {
    const config = loadConfig();

    // Try to fetch quota from CLIProxy's management endpoint
    try {
      const response = await fetch(`http://127.0.0.1:${config.cliproxyPort}/stats`, {
        headers: { 'X-Secret-Key': config.managementKey },
      });

      if (response.ok) {
        const cliproxyStats = await response.json() as Record<string, unknown>;
        res.json({
          source: 'cliproxy',
          ...cliproxyStats,
          localStats: requestStats,
        });
        return;
      }
    } catch {
      // CLIProxy stats not available
    }

    // Fallback to local stats
    res.json({
      source: 'local',
      ...requestStats,
      message: 'CLIProxy stats not available, showing local tracking only',
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/stats/reset - Reset local statistics
 */
router.post('/stats/reset', requireApiKey, (_req: Request, res: Response) => {
  try {
    requestStats.totalRequests = 0;
    requestStats.successCount = 0;
    requestStats.failureCount = 0;
    requestStats.tokens = { input: 0, output: 0, total: 0 };
    requestStats.requestsByProvider = {};
    requestStats.collectedAt = new Date().toISOString();

    res.json({ success: true, message: 'Statistics reset' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

// ============================================
// Account Switching Endpoints
// ============================================

/**
 * GET /api/accounts/status - Get account switching status for all providers
 */
router.get('/accounts/status', requireApiKey, (_req: Request, res: Response) => {
  try {
    const status = getAccountSwitchingStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * GET /api/accounts/:provider - Get accounts for a specific provider
 */
router.get('/accounts/:provider', requireApiKey, (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as CLIProxyProvider;
    const validProviders = ['gemini', 'codex', 'agy', 'qwen', 'iflow', 'kiro', 'ghcp'];

    if (!validProviders.includes(provider)) {
      res.status(400).json({ error: 'Invalid provider', validProviders });
      return;
    }

    const accounts = getAccountsForProvider(provider);
    const active = getActiveAccount(provider);

    res.json({
      provider,
      accounts,
      activeAccount: active?.email || null,
      totalAccounts: accounts.length,
    });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/:provider/switch - Switch to a specific account (like --use flag)
 */
router.post('/accounts/:provider/switch', requireApiKey, (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as CLIProxyProvider;
    const { accountId, email } = req.body as { accountId?: string; email?: string };
    const targetAccount = accountId || email;

    if (!targetAccount) {
      res.status(400).json({ error: 'accountId or email required in request body' });
      return;
    }

    const success = setActiveAccount(provider, targetAccount);
    if (success) {
      const active = getActiveAccount(provider);
      res.json({
        success: true,
        message: `Switched to account: ${active?.email}`,
        activeAccount: active,
      });
    } else {
      res.status(404).json({
        error: 'Account not found',
        message: `No account matching "${targetAccount}" found for provider ${provider}`
      });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/:provider/next - Switch to next available account
 */
router.post('/accounts/:provider/next', requireApiKey, (req: Request, res: Response) => {
  try {
    const provider = req.params.provider as CLIProxyProvider;
    const nextAccount = switchToNextAccount(provider);

    if (nextAccount) {
      res.json({
        success: true,
        message: `Switched to next account: ${nextAccount.email}`,
        activeAccount: nextAccount,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'No available accounts',
        message: 'All accounts are either expired or quota exceeded',
      });
    }
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

/**
 * POST /api/accounts/clear-quota - Clear quota exceeded flags for all accounts
 */
router.post('/accounts/clear-quota', requireApiKey, (_req: Request, res: Response) => {
  try {
    clearQuotaExceeded();
    res.json({ success: true, message: 'Cleared all quota exceeded flags' });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
});

export default router;

