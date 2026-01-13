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
import { HealthStatus } from './types';

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

export default router;

