/**
 * CCS Remote - Proxy Handler
 *
 * Forwards API requests to CLIProxy binary
 */

import { Request, Response, Router } from 'express';
import * as http from 'http';
import { loadConfig } from './config';

const router = Router();

/**
 * Forward request to CLIProxy
 */
async function forwardToCliproxy(req: Request, res: Response): Promise<void> {
  const config = loadConfig();
  const targetUrl = `http://127.0.0.1:${config.cliproxyPort}${req.originalUrl.replace('/proxy', '')}`;

  // Validate auth
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (token !== config.apiKey) {
    res.status(403).json({ error: 'Invalid API key' });
    return;
  }

  try {
    const url = new URL(targetUrl);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
      headers: {
        ...req.headers,
        host: `${url.hostname}:${url.port}`,
        authorization: `Bearer ${config.apiKey}`,
      },
    };

    // Remove headers that shouldn't be forwarded
    const headers = options.headers as Record<string, string | string[] | undefined>;
    delete headers['content-length'];

    const proxyReq = http.request(options, (proxyRes) => {
      // Copy status and headers
      res.status(proxyRes.statusCode || 500);
      Object.entries(proxyRes.headers).forEach(([key, value]) => {
        if (value) res.setHeader(key, value);
      });

      // Stream response
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[proxy] Request error:', err);
      if (!res.headersSent) {
        res.status(502).json({ error: 'CLIProxy unavailable', details: err.message });
      }
    });

    // Forward request body
    req.pipe(proxyReq);
  } catch (error) {
    console.error('[proxy] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: (error as Error).message });
    }
  }
}

/**
 * Proxy all /api/provider/* requests to CLIProxy
 * This matches the CCS pattern for provider-specific endpoints
 */
router.all('/provider/*', forwardToCliproxy);

/**
 * Proxy /v1/* requests (OpenAI-compatible endpoints)
 */
router.all('/v1/*', async (req: Request, res: Response) => {
  const config = loadConfig();
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
  const targetPath = req.originalUrl.replace('/proxy', '');
  const targetUrl = `http://127.0.0.1:${config.cliproxyPort}${targetPath}`;

  // Require management key for management endpoints
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '');
  if (token !== config.managementKey) {
    res.status(403).json({ error: 'Management key required' });
    return;
  }

  try {
    const url = new URL(targetUrl);

    const options: http.RequestOptions = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: req.method,
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

