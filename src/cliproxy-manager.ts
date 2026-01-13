/**
 * CCS Remote - CLIProxy binary management
 *
 * Manages the CLIProxyAPI binary for remote deployment.
 *
 * Binary lookup order:
 * 1. CLIPROXY_BIN_PATH environment variable
 * 2. ./bin/cli-proxy-api-plus (local bin directory)
 * 3. /app/bin/cli-proxy-api-plus (Docker default)
 * 4. System PATH (cli-proxy-api-plus)
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn, ChildProcess, execSync } from 'child_process';
import { getBinDir, getCliproxyDir, loadConfig, generateCliproxyConfig } from './config';

let proxyProcess: ChildProcess | null = null;

/**
 * Get executable name for current platform
 */
function getExecutableName(): string {
  return process.platform === 'win32' ? 'cli-proxy-api-plus.exe' : 'cli-proxy-api-plus';
}

/**
 * Search paths for CLIProxy binary
 */
function getBinarySearchPaths(): string[] {
  const execName = getExecutableName();
  const paths: string[] = [];

  // 1. Environment variable (highest priority)
  if (process.env.CLIPROXY_BIN_PATH) {
    paths.push(process.env.CLIPROXY_BIN_PATH);
  }

  // 2. Local ./bin directory
  paths.push(path.join(process.cwd(), 'bin', execName));

  // 3. Data directory bin
  paths.push(path.join(getBinDir(), execName));

  // 4. Docker default location
  paths.push(path.join('/app', 'bin', execName));

  // 5. Alternative names
  paths.push(path.join(process.cwd(), 'bin', 'CLIProxyAPI'));
  paths.push(path.join(getBinDir(), 'CLIProxyAPI'));
  paths.push('/app/bin/CLIProxyAPI');

  return paths;
}

/**
 * Find CLIProxy binary in search paths
 */
function findBinary(): string | null {
  for (const binPath of getBinarySearchPaths()) {
    if (fs.existsSync(binPath)) {
      console.log(`[cliproxy] Found binary at: ${binPath}`);
      return binPath;
    }
  }
  return null;
}

/**
 * Check if binary exists in system PATH
 */
function findBinaryInPath(): string | null {
  const execName = getExecutableName();
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${cmd} ${execName}`, { encoding: 'utf-8' }).trim();
    if (result) {
      console.log(`[cliproxy] Found binary in PATH: ${result}`);
      return result.split('\n')[0]; // Take first result
    }
  } catch {
    // Not found in PATH
  }
  return null;
}

/**
 * Get full path to binary (checking all locations)
 */
export function getBinaryPath(): string | null {
  // Check file system first
  const localBinary = findBinary();
  if (localBinary) return localBinary;

  // Check system PATH
  const pathBinary = findBinaryInPath();
  if (pathBinary) return pathBinary;

  return null;
}

/**
 * Check if binary is installed/available
 */
export function isBinaryInstalled(): boolean {
  return getBinaryPath() !== null;
}

/**
 * Get detailed error message for missing binary
 */
function getMissingBinaryError(): string {
  const searchPaths = getBinarySearchPaths();
  return `
CLIProxy binary not found!

CCS Remote requires the CLIProxyAPI binary to proxy requests.

Please ensure the binary is available in one of these locations:
${searchPaths.map(p => `  - ${p}`).join('\n')}

Or set the CLIPROXY_BIN_PATH environment variable to the binary path.

To install CLIProxy:
1. Download from: https://github.com/router-for-me/CLIProxyAPIPlus/releases
2. Extract and place the binary in ./bin/ directory
3. Make it executable: chmod +x ./bin/cli-proxy-api-plus

For Docker deployment:
  Copy the binary to /app/bin/cli-proxy-api-plus in your Dockerfile
`.trim();
}

/**
 * Ensure binary is available (throws if not found)
 */
export async function ensureBinary(): Promise<string> {
  const binaryPath = getBinaryPath();

  if (!binaryPath) {
    const errorMsg = getMissingBinaryError();
    console.error('[cliproxy] ' + errorMsg);
    throw new Error('CLIProxy binary not found. See logs for installation instructions.');
  }

  // Ensure executable permission on Unix
  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(binaryPath, 0o755);
    } catch {
      // Ignore permission errors (might be read-only filesystem)
    }
  }

  return binaryPath;
}

/**
 * Start CLIProxy process
 */
export async function startProxy(): Promise<boolean> {
  if (proxyProcess && !proxyProcess.killed) {
    console.log('[cliproxy] Proxy already running');
    return true;
  }

  const binaryPath = await ensureBinary();
  const configPath = generateCliproxyConfig();
  const config = loadConfig();

  console.log(`[cliproxy] Starting proxy on port ${config.cliproxyPort}...`);

  proxyProcess = spawn(binaryPath, ['--config', configPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: {
      ...process.env,
      WRITABLE_PATH: getCliproxyDir(),
    },
  });

  proxyProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[cliproxy] ${data.toString().trim()}`);
  });

  proxyProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[cliproxy-err] ${data.toString().trim()}`);
  });

  proxyProcess.on('error', (err) => {
    console.error('[cliproxy] Process error:', err);
  });

  proxyProcess.on('exit', (code) => {
    console.log(`[cliproxy] Process exited with code ${code}`);
    proxyProcess = null;
  });

  // Wait for proxy to be ready
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return isProxyRunning();
}

/**
 * Stop CLIProxy process
 */
export function stopProxy(): boolean {
  if (!proxyProcess || proxyProcess.killed) {
    return true;
  }

  proxyProcess.kill('SIGTERM');
  proxyProcess = null;
  return true;
}

/**
 * Check if proxy is running by health check
 */
export async function isProxyRunning(): Promise<boolean> {
  const config = loadConfig();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1000);

    const response = await fetch(`http://127.0.0.1:${config.cliproxyPort}/`, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get proxy process status
 */
export function getProxyStatus(): { running: boolean; pid?: number } {
  if (proxyProcess && !proxyProcess.killed && proxyProcess.pid) {
    return { running: true, pid: proxyProcess.pid };
  }
  return { running: false };
}

