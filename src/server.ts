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
import { loadConfig, ensureDataDirs } from './config';
import apiRoutes from './routes';
import proxyHandler from './proxy-handler';
import { startProxy } from './cliproxy-manager';

async function main(): Promise<void> {
  console.log('[ccs-remote] Starting CCS Remote Proxy Server...');

  // Ensure data directories exist
  ensureDataDirs();

  // Load configuration
  const config = loadConfig();
  console.log(`[ccs-remote] Configuration loaded:`);
  console.log(`  - Server: ${config.host}:${config.port}`);
  console.log(`  - Data dir: ${config.dataDir}`);
  console.log(`  - CLIProxy port: ${config.cliproxyPort}`);

  // Start CLIProxy binary
  console.log('[ccs-remote] Starting CLIProxy...');
  const proxyStarted = await startProxy();
  if (proxyStarted) {
    console.log('[ccs-remote] CLIProxy started successfully');
  } else {
    console.warn('[ccs-remote] Warning: CLIProxy failed to start. API proxying may not work.');
  }

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

  // API routes
  app.use('/api', apiRoutes);

  // Proxy routes - forward to CLIProxy
  app.use('/proxy', proxyHandler);

  // Root endpoint - basic info
  app.get('/', (_req, res) => {
    res.json({
      name: 'CCS Remote Proxy Server',
      version: '1.0.0',
      status: 'running',
      endpoints: {
        health: '/api/health',
        auth: '/api/auth/status',
        proxy: '/proxy/api/provider/{provider}',
        v1: '/proxy/v1/*',
      },
    });
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

