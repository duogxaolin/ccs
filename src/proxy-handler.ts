/**
 * CCS Remote - Proxy Handler
 *
 * Forwards API requests to CLIProxy binary with:
 * - Auto-start CLIProxy if not running
 * - OAuth token injection from auth files
 * - Timeout handling
 * - Auto-switch on 429 errors
 * - Stats tracking
 */

import { Request, Response, Router } from 'express';
import * as http from 'http';
import { loadConfig } from './config';
import { isProxyRunning, startProxy } from './cliproxy-manager';
import {
  markQuotaExceeded,
  switchToNextAccount,
  loadAccountState,
  getActiveAccount
} from './account-switcher';
import { getAccountToken, getFirstAccessTokenForProvider } from './auth-manager';
import { incrementRequestStats } from './routes';
import { CLIProxyProvider } from './types';

const router = Router();

// Request timeout in milliseconds
const REQUEST_TIMEOUT = 120000; // 2 minutes

// Track retry attempts per request
const MAX_RETRIES = 3;

// Initialize account state on module load
loadAccountState();

/**
 * Ensure CLIProxy is running, start if needed
 */
async function ensureProxyRunning(): Promise<boolean> {
  if (await isProxyRunning()) {
    return true;
  }

  console.log('[proxy] CLIProxy not running, attempting to start...');
  const started = await startProxy();
  if (!started) {
    console.error('[proxy] Failed to start CLIProxy');
    return false;
  }

  // Wait a bit for proxy to be ready
  await new Promise(resolve => setTimeout(resolve, 1000));
  return await isProxyRunning();
}

/**
 * Extract provider from request path
 */
function extractProvider(path: string): CLIProxyProvider | null {
  // Match /api/provider/{provider} or /provider/{provider}
  const match = path.match(/\/(?:api\/)?provider\/([a-z]+)/i);
  if (match) {
    const provider = match[1].toLowerCase();
    const validProviders = ['gemini', 'codex', 'agy', 'qwen', 'iflow', 'kiro', 'ghcp'];
    if (validProviders.includes(provider)) {
      return provider as CLIProxyProvider;
    }
  }
  return null;
}

/**
 * Get OAuth access token for the active account of a provider
 */
function getOAuthToken(provider: CLIProxyProvider): string | null {
  // Try to get token for active account
  const activeAccount = getActiveAccount(provider);
  if (activeAccount) {
    const token = getAccountToken(provider, activeAccount.id);
    if (token) {
      console.log(`[proxy] Using OAuth token for account: ${activeAccount.email}`);
      return token;
    }
  }

  // Fallback to first available token
  const firstToken = getFirstAccessTokenForProvider(provider);
  if (firstToken) {
    console.log(`[proxy] Using fallback OAuth token for: ${firstToken.email}`);
    return firstToken.token;
  }

  return null;
}

/**
 * Forward request to CLIProxy with retry and auto-switch on 429
 */
async function forwardToCliproxy(
  req: Request,
  res: Response,
  retryCount = 0
): Promise<void> {
  const config = loadConfig();
  const targetPath = req.originalUrl.replace('/proxy', '');
  const targetUrl = `http://127.0.0.1:${config.cliproxyPort}${targetPath}`;

  // Validate auth - check API key
  const authHeader = req.headers.authorization;
  const xApiKey = req.headers['x-api-key'];
  let clientToken: string | undefined;

  if (authHeader) {
    clientToken = authHeader.replace(/^Bearer\s+/i, '');
  } else if (xApiKey) {
    clientToken = Array.isArray(xApiKey) ? xApiKey[0] : xApiKey;
  }

  if (!clientToken) {
    res.status(401).json({
      error: 'Missing authentication',
      message: 'Provide API key via Authorization: Bearer <key> or X-API-Key: <key>'
    });
    return;
  }

  if (clientToken !== config.apiKey && clientToken !== config.managementKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  // Ensure CLIProxy is running
  if (!(await ensureProxyRunning())) {
    res.status(503).json({
      error: 'CLIProxy service unavailable',
      message: 'Failed to start CLIProxy. Check logs for details.'
    });
    return;
  }

  // Extract provider for stats tracking and OAuth token
  const provider = extractProvider(targetPath);

  // Get OAuth token for the provider
  let oauthToken: string | null = null;
  if (provider) {
    oauthToken = getOAuthToken(provider);
    if (!oauthToken) {
      res.status(401).json({
        error: 'No OAuth token available',
        message: `No valid auth file found for provider: ${provider}. Please copy auth files to data/cliproxy/auth/`
      });
      return;
    }
  }

  try {
    const url = new URL(targetUrl);

    // Build headers for CLIProxy
    // CLIProxy expects the API key for its own auth, but we also inject the OAuth token
    // as a custom header that CLIProxy can use for upstream API calls
    const proxyHeaders: Record<string, string | string[] | undefined> = {
      ...req.headers,
      host: `${url.hostname}:${url.port}`,
      // Use API key for CLIProxy auth
      authorization: `Bearer ${config.apiKey}`,
    };

    // If we have an OAuth token, add it as a custom header
    // CLIProxy should use this for authenticating with the upstream provider API
    if (oauthToken) {
      proxyHeaders['x-oauth-token'] = oauthToken;
    }

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      timeout: REQUEST_TIMEOUT,
      headers: proxyHeaders,
    };

    // Remove headers that shouldn't be forwarded
    const headers = options.headers as Record<string, string | string[] | undefined>;
    delete headers['content-length'];

    // Collect response body to check for 429
    let responseBody = '';
    let statusCode = 0;

    const proxyReq = http.request(options, (proxyRes) => {
      statusCode = proxyRes.statusCode || 500;

      // Handle 429 - quota exceeded
      if (statusCode === 429 && provider && retryCount < MAX_RETRIES) {
        // Collect body to check if it's quota related
        const chunks: Buffer[] = [];
        proxyRes.on('data', (chunk: Buffer) => chunks.push(chunk));
        proxyRes.on('end', async () => {
          responseBody = Buffer.concat(chunks).toString();

          // Mark current account as quota exceeded
          markQuotaExceeded(provider);

          // Try to switch to next account
          const nextAccount = switchToNextAccount(provider);
          if (nextAccount) {
            console.log(`[proxy] Quota exceeded, retrying with account: ${nextAccount.email}`);
            // Retry with new account
            await forwardToCliproxy(req, res, retryCount + 1);
          } else {
            // No more accounts available
            incrementRequestStats(provider, false);
            res.status(429).json({
              error: 'All accounts quota exceeded',
              message: 'No available accounts with remaining quota',
              originalResponse: responseBody,
            });
          }
        });
        return;
      }

      // Track stats
      if (provider) {
        incrementRequestStats(provider, statusCode < 400);
      }

      // Copy status and headers
      res.status(statusCode);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value) res.setHeader(key, value);
      });

      // Stream response
      proxyRes.pipe(res);
    });

    // Timeout handling
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        if (provider) incrementRequestStats(provider, false);
        res.status(504).json({ error: 'Gateway timeout', message: 'CLIProxy request timed out' });
      }
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy] Request error:', err);
      if (!res.headersSent) {
        if (provider) incrementRequestStats(provider, false);
        res.status(502).json({ error: 'CLIProxy unavailable', details: err.message });
      }
    });

    // Forward request body
    req.pipe(proxyReq);
  } catch (error) {
    console.error('[proxy] Error:', error);
    if (!res.headersSent) {
      if (provider) incrementRequestStats(provider, false);
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

/**
 * Route handler wrapper for forwardToCliproxy
 */
async function handleProxyRequest(req: Request, res: Response): Promise<void> {
  return forwardToCliproxy(req, res, 0);
}

/**
 * Proxy all /api/provider/* requests to CLIProxy
 * This matches the CCS pattern for provider-specific endpoints
 */
router.all('/provider/*', handleProxyRequest);

/**
 * Proxy /api/* requests (direct API pass-through)
 */
router.all('/api/*', handleProxyRequest);

/**
 * Proxy /v1/* requests (OpenAI-compatible endpoints)
 */
router.all('/v1/*', async (req: Request, res: Response) => {
  const config = loadConfig();

  // Ensure CLIProxy is running
  if (!(await ensureProxyRunning())) {
    res.status(503).json({
      error: 'CLIProxy service unavailable',
      message: 'Failed to start CLIProxy. Check logs for details.'
    });
    return;
  }

  const targetPath = req.originalUrl.replace('/proxy', '');
  const targetUrl = `http://127.0.0.1:${config.cliproxyPort}${targetPath}`;

  try {
    const url = new URL(targetUrl);
    const authHeader = req.headers.authorization;

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      timeout: REQUEST_TIMEOUT,
      headers: {
        ...req.headers,
        host: `${url.hostname}:${url.port}`,
        authorization: authHeader || `Bearer ${config.apiKey}`,
      },
    };

    const v1Headers = options.headers as Record<string, string | string[] | undefined>;
    delete v1Headers['content-length'];

    const proxyReq = http.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode || 500);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value) res.setHeader(key, value);
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway timeout' });
      }
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'CLIProxy unavailable', details: err.message });
      }
    });

    req.pipe(proxyReq);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

/**
 * Proxy /v0/management/* requests (management endpoints)
 */
router.all('/v0/management/*', async (req: Request, res: Response) => {
  const config = loadConfig();

  // Require management key for management endpoints
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (token !== config.managementKey) {
    res.status(403).json({ error: 'Management key required' });
    return;
  }

  // Ensure CLIProxy is running
  if (!(await ensureProxyRunning())) {
    res.status(503).json({
      error: 'CLIProxy service unavailable',
      message: 'Failed to start CLIProxy. Check logs for details.'
    });
    return;
  }

  const targetPath = req.originalUrl.replace('/proxy', '');
  const targetUrl = `http://127.0.0.1:${config.cliproxyPort}${targetPath}`;

  try {
    const url = new URL(targetUrl);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      timeout: REQUEST_TIMEOUT,
      headers: {
        ...req.headers,
        host: `${url.hostname}:${url.port}`,
        authorization: `Bearer ${config.managementKey}`,
      },
    };

    const mgmtHeaders = options.headers as Record<string, string | string[] | undefined>;
    delete mgmtHeaders['content-length'];

    const proxyReq = http.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode || 500);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value) res.setHeader(key, value);
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway timeout' });
      }
    });

    proxyReq.on('error', (err) => {
      if (!res.headersSent) {
        res.status(502).json({ error: 'CLIProxy unavailable', details: err.message });
      }
    });

    req.pipe(proxyReq);
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
});

export default router;

