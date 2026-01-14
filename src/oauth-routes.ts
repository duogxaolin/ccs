/**
 * CCS Remote - OAuth Routes
 *
 * Handles OAuth authentication for adding new accounts via the dashboard.
 * For remote deployment, we need to handle OAuth flows that work without
 * direct localhost access from the user's browser.
 *
 * Flow types:
 * - Device Code: ghcp, qwen (no callback needed - user enters code on external page)
 * - Authorization Code: agy, gemini, codex, kiro, iflow (needs callback)
 */

import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { loadConfig, getAuthDir, getCliproxyDir } from './config';
import { getBinaryPath } from './cliproxy-manager';
import { CLIProxyProvider } from './types';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

/** OAuth session state */
interface OAuthSession {
  id: string;
  provider: CLIProxyProvider;
  status: 'pending' | 'complete' | 'error';
  flow: 'device' | 'authorization';
  userCode?: string;
  verificationUrl?: string;
  email?: string;
  error?: string;
  process?: ChildProcess;
  startedAt: number;
  output: string[];
}

/** Active OAuth sessions */
const oauthSessions = new Map<string, OAuthSession>();

/** OAuth callback ports per provider */
const OAUTH_CALLBACK_PORTS: Record<CLIProxyProvider, number | null> = {
  gemini: 8085,
  codex: 1455,
  agy: 51121,
  qwen: null,
  iflow: 11451,
  kiro: 9876,
  ghcp: null,
};

/** OAuth flow types per provider */
const OAUTH_FLOW_TYPES: Record<CLIProxyProvider, 'authorization_code' | 'device_code'> = {
  gemini: 'authorization_code',
  codex: 'authorization_code',
  agy: 'authorization_code',
  qwen: 'device_code',
  iflow: 'authorization_code',
  kiro: 'authorization_code',
  ghcp: 'device_code',
};

/** Auth flags per provider */
const AUTH_FLAGS: Record<CLIProxyProvider, string> = {
  gemini: '--login',
  codex: '--codex-login',
  agy: '--antigravity-login',
  qwen: '--qwen-login',
  iflow: '--iflow-login',
  kiro: '--kiro-login',
  ghcp: '--copilot-login',
};

/** Clean up old sessions (older than 10 minutes) */
function cleanupOldSessions(): void {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  for (const [id, session] of oauthSessions) {
    if (now - session.startedAt > maxAge) {
      if (session.process && !session.process.killed) {
        session.process.kill();
      }
      oauthSessions.delete(id);
    }
  }
}

/**
 * POST /oauth/:provider/start - Start OAuth flow
 */
router.post('/:provider/start', async (req: Request, res: Response) => {
  cleanupOldSessions();

  const provider = req.params.provider as CLIProxyProvider;
  const validProviders = Object.keys(OAUTH_FLOW_TYPES);

  if (!validProviders.includes(provider)) {
    res.status(400).json({ error: 'Invalid provider', validProviders });
    return;
  }

  const binaryPath = getBinaryPath();
  if (!binaryPath) {
    res.status(500).json({ error: 'CLIProxy binary not installed' });
    return;
  }

  // Create session
  const sessionId = randomUUID();
  const flowType = OAUTH_FLOW_TYPES[provider];
  const callbackPort = OAUTH_CALLBACK_PORTS[provider];

  const session: OAuthSession = {
    id: sessionId,
    provider,
    status: 'pending',
    flow: flowType === 'device_code' ? 'device' : 'authorization',
    startedAt: Date.now(),
    output: [],
  };

  oauthSessions.set(sessionId, session);

  // Generate CLIProxy config for this auth
  const config = loadConfig();
  const configPath = path.join(getCliproxyDir(), `oauth-${sessionId}.yaml`);

  // Create minimal config for OAuth
  const configContent = `host: "${config.host === '0.0.0.0' ? 'localhost' : config.host}"
port: ${config.cliproxyPort}
model: "claude-sonnet-4-20250514"
max_tokens: 16384
secret_key: "${config.managementKey}"
`;

  fs.writeFileSync(configPath, configContent);

  // Build args
  const args = ['--config', configPath, AUTH_FLAGS[provider], '--no-browser'];

  // Set auth dir via environment
  const authDir = path.join(getAuthDir(), provider);
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  console.log(`[oauth] Starting OAuth for ${provider} (session: ${sessionId})`);
  console.log(`[oauth] Binary: ${binaryPath}`);
  console.log(`[oauth] Args: ${args.join(' ')}`);

  // Spawn OAuth process
  const authProcess = spawn(binaryPath, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, CLI_PROXY_AUTH_DIR: authDir },
  });

  session.process = authProcess;

  // Capture output
  authProcess.stdout?.on('data', (data) => {
    const output = data.toString();
    session.output.push(output);
    console.log(`[oauth:${sessionId}] stdout: ${output}`);

    // Parse device code
    const codeMatch = output.match(/code[:\s]+([A-Z0-9-]{6,12})/i);
    if (codeMatch) {
      session.userCode = codeMatch[1].toUpperCase();
    }

    // Parse verification URL
    const urlMatch = output.match(/(https?:\/\/[^\s]+)/);
    if (urlMatch && !session.verificationUrl) {
      session.verificationUrl = urlMatch[1];
    }

    // Check for success
    if (output.includes('Success') || output.includes('authenticated') || output.includes('Logged in')) {
      session.status = 'complete';
      // Try to extract email
      const emailMatch = output.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
      if (emailMatch) {
        session.email = emailMatch[1];
      }
    }
  });

  authProcess.stderr?.on('data', (data) => {
    const output = data.toString();
    session.output.push(output);
    console.log(`[oauth:${sessionId}] stderr: ${output}`);
  });

  authProcess.on('exit', (code) => {
    console.log(`[oauth:${sessionId}] Process exited with code ${code}`);

    // Clean up config file
    try {
      fs.unlinkSync(configPath);
    } catch { /* ignore */ }

    if (code === 0 && session.status !== 'error') {
      session.status = 'complete';
      // Scan for new token file to get email
      try {
        const files = fs.readdirSync(authDir);
        const jsonFiles = files.filter(f => f.endsWith('.json'));
        if (jsonFiles.length > 0) {
          const latestFile = jsonFiles.sort((a, b) => {
            const statA = fs.statSync(path.join(authDir, a));
            const statB = fs.statSync(path.join(authDir, b));
            return statB.mtimeMs - statA.mtimeMs;
          })[0];
          const tokenData = JSON.parse(fs.readFileSync(path.join(authDir, latestFile), 'utf-8'));
          session.email = tokenData.email || tokenData.account_id || session.email;
        }
      } catch { /* ignore */ }
    } else if (session.status === 'pending') {
      session.status = 'error';
      session.error = `OAuth process exited with code ${code}`;
    }
  });

  // For device code flow, wait a bit for the code to appear
  if (flowType === 'device_code') {
    await new Promise(resolve => setTimeout(resolve, 2000));

    res.json({
      sessionId,
      flow: 'device',
      userCode: session.userCode || 'LOADING...',
      verificationUrl: session.verificationUrl || getDefaultVerificationUrl(provider),
      pollUrl: `/oauth/${provider}/poll/${sessionId}`,
    });
  } else {
    // Authorization code flow

    res.json({
      sessionId,
      flow: 'authorization',
      authUrl: session.verificationUrl || null,
      callbackPort,
      message: `Complete OAuth in the browser. Callback server running on port ${callbackPort}`,
      pollUrl: `/oauth/${provider}/poll/${sessionId}`,
    });
  }
});

/** Get default verification URL for device code providers */
function getDefaultVerificationUrl(provider: CLIProxyProvider): string {
  switch (provider) {
    case 'ghcp':
      return 'https://github.com/login/device';
    case 'qwen':
      return 'https://account.aliyun.com/login/login.htm';
    default:
      return '';
  }
}

/**
 * GET /oauth/:provider/poll/:sessionId - Poll OAuth status
 */
router.get('/:provider/poll/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = oauthSessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found or expired' });
    return;
  }

  if (session.status === 'complete') {
    // Clean up session after successful completion
    oauthSessions.delete(sessionId);
    res.json({
      status: 'complete',
      email: session.email || 'Unknown',
      provider: session.provider,
    });
  } else if (session.status === 'error') {
    oauthSessions.delete(sessionId);
    res.json({
      status: 'error',
      error: session.error || 'OAuth failed',
    });
  } else {
    // Still pending
    res.json({
      status: 'pending',
      userCode: session.userCode,
      verificationUrl: session.verificationUrl,
      elapsedSeconds: Math.floor((Date.now() - session.startedAt) / 1000),
    });
  }
});

/**
 * POST /oauth/:provider/cancel/:sessionId - Cancel OAuth session
 */
router.post('/:provider/cancel/:sessionId', (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = oauthSessions.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.process && !session.process.killed) {
    session.process.kill();
  }

  oauthSessions.delete(sessionId);
  res.json({ success: true, message: 'OAuth cancelled' });
});

/**
 * GET /oauth/sessions - List active OAuth sessions (for debugging)
 */
router.get('/sessions', (_req: Request, res: Response) => {
  cleanupOldSessions();

  const sessions = Array.from(oauthSessions.values()).map(s => ({
    id: s.id,
    provider: s.provider,
    status: s.status,
    flow: s.flow,
    userCode: s.userCode,
    elapsedSeconds: Math.floor((Date.now() - s.startedAt) / 1000),
  }));

  res.json({ sessions });
});

export default router;
