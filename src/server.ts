/**
 * CCS Remote - Main Server
 *
 * Remote proxy server for CCS (Claude Code Switch)
 * Allows deploying CLIProxy on a remote server and accessing via Claude Code
 *
 * Usage:
 *   - Copy .ccs/cliproxy/auth/ files to server data directory
 *   - Configure environment variables or config.yaml
 *   - Start with: node dist/server.js
 *   - Connect Claude Code with ANTHROPIC_BASE_URL=http://your-server:8318/proxy
 */

import express from 'express';
import cors from 'cors';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig, ensureDataDirs, getAuthDir } from './config';
import apiRoutes from './routes';
import proxyHandler from './proxy-handler';
import dashboardRouter from './dashboard';
import oauthRouter from './oauth-routes';
import { startProxy, isBinaryInstalled } from './cliproxy-manager';
import { startTokenRefreshService } from './token-refresh';
import { countAuthFiles, getAllAuthStatus } from './auth-manager';

/**
 * Validate startup configuration and show warnings
 */
function validateStartup(): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];
  const config = loadConfig();
  const authDir = getAuthDir();

  // Check auth directory
  if (!fs.existsSync(authDir)) {
    warnings.push(`Auth directory does not exist: ${authDir}`);
    warnings.push('  Create it and copy your auth files from Windows .ccs/cliproxy/auth/');
  }

  // Check for auth files
  const authCount = countAuthFiles();
  if (authCount === 0) {
    warnings.push('No auth files found!');
    warnings.push('  Copy .json files from Windows C:\\Users\\<user>\\.ccs\\cliproxy\\auth\\');
    warnings.push(`  to ${authDir}`);
  } else {
    console.log(`[startup] Found ${authCount} auth file(s)`);

    // Show auth status per provider
    const authStatus = getAllAuthStatus();
    for (const status of authStatus) {
      if (status.accounts.length > 0) {
        const expired = status.accounts.filter(a => a.isExpired).length;
        const valid = status.accounts.length - expired;
        console.log(`  - ${status.provider}: ${valid} valid, ${expired} expired`);
      }
    }
  }

  // Check CLIProxy binary
  if (!isBinaryInstalled()) {
    warnings.push('CLIProxy binary not found!');
    warnings.push('  Download from: https://github.com/router-for-me/CLIProxyAPIPlus/releases');
    warnings.push('  Place in ./bin/ or set CLIPROXY_BIN_PATH environment variable');
  }

  // Check security settings
  if (config.apiKey === 'ccs-remote-key') {
    warnings.push('Using default API key! Set CCS_API_KEY environment variable for production.');
  }
  if (config.managementKey === 'ccs-remote-mgmt') {
    warnings.push('Using default management key! Set CCS_MANAGEMENT_KEY for production.');
  }

  return { warnings, errors };
}

async function main(): Promise<void> {
  console.log('[ccs-remote] Starting CCS Remote Proxy Server...');
  console.log('');

  // Ensure data directories exist
  ensureDataDirs();

  // Load configuration
  const config = loadConfig();
  console.log(`[ccs-remote] Configuration loaded:`);
  console.log(`  - Server: ${config.host}:${config.port}`);
  console.log(`  - Data dir: ${config.dataDir}`);
  console.log(`  - CLIProxy port: ${config.cliproxyPort}`);
  console.log('');

  // Validate startup
  const { warnings, errors } = validateStartup();

  if (errors.length > 0) {
    console.error('[ccs-remote] ERRORS:');
    for (const error of errors) {
      console.error(`  ❌ ${error}`);
    }
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('[ccs-remote] WARNINGS:');
    for (const warning of warnings) {
      console.warn(`  ⚠️  ${warning}`);
    }
    console.log('');
  }

  // Start CLIProxy binary
  console.log('[ccs-remote] Starting CLIProxy...');
  const proxyStarted = await startProxy();
  if (proxyStarted) {
    console.log('[ccs-remote] CLIProxy started successfully');
  } else {
    console.warn('[ccs-remote] Warning: CLIProxy failed to start. API proxying may not work.');
  }

  // Start token refresh service (refresh tokens every 15 minutes)
  console.log('[ccs-remote] Starting token refresh service...');
  startTokenRefreshService(15);

  // Create Express app
  const app = express();

  // CORS configuration
  const corsOptions: cors.CorsOptions = {
    origin: config.corsOrigins.includes('*') ? true : config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  };
  app.use(cors(corsOptions));

  // Body parsing - but keep raw body for proxy
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Docker health check endpoint (no auth required)
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  });

  // API routes
  app.use('/api', apiRoutes);

  // OAuth routes
  app.use('/oauth', oauthRouter);

  // Serve static UI from dist/ui (built React app)
  const uiDistPath = path.join(__dirname, 'ui');
  if (fs.existsSync(uiDistPath)) {
    console.log(`[ccs-remote] Serving UI from ${uiDistPath}`);
    app.use(express.static(uiDistPath));
  }

  // Dashboard UI (legacy HTML dashboard as fallback)
  app.use('/dashboard', dashboardRouter);

  // Proxy routes - forward to CLIProxy
  app.use('/proxy', proxyHandler);

  // Root endpoint - serve React UI or redirect to dashboard
  app.get('/', (_req, res) => {
    const indexPath = path.join(__dirname, 'ui', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.redirect('/dashboard');
    }
  });

  // SPA fallback - serve index.html for non-API routes
  app.get('*', (req, res, next) => {
    // Skip API and proxy routes
    if (req.path.startsWith('/api') || req.path.startsWith('/proxy') ||
        req.path.startsWith('/oauth') || req.path.startsWith('/dashboard') ||
        req.path.startsWith('/health')) {
      return next();
    }
    const indexPath = path.join(__dirname, 'ui', 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      next();
    }
  });

  // Start server
  app.listen(config.port, config.host, () => {
    console.log('');
    console.log('='.repeat(60));
    console.log('[ccs-remote] Server running!');
    console.log(`  URL: http://${config.host}:${config.port}`);
    console.log('');
    console.log('  For Claude Code, set:');
    console.log(`    ANTHROPIC_BASE_URL=http://YOUR_IP:${config.port}/proxy/api/provider/agy`);
    console.log(`    ANTHROPIC_AUTH_TOKEN=${config.apiKey}`);
    console.log('');
    console.log('  Health check: curl http://localhost:' + config.port + '/api/health');
    console.log('='.repeat(60));
  });

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log('\n[ccs-remote] Shutting down...');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[ccs-remote] Fatal error:', error);
  process.exit(1);
});

