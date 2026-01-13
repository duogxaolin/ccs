/**
 * CCS Remote - CLIProxy binary management
 *
 * Downloads, installs, and manages the CLIProxyAPIPlus binary
 */

import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { spawn, ChildProcess } from 'child_process';
import { getBinDir, getCliproxyDir, loadConfig, generateCliproxyConfig } from './config';

const CLIPROXY_VERSION = '6.6.40-0';
const GITHUB_RELEASES_BASE = 'https://github.com/router-for-me/CLIProxyAPIPlus/releases/download';

let proxyProcess: ChildProcess | null = null;

/**
 * Detect platform for binary download
 */
function detectPlatform(): { os: string; arch: string; ext: string } {
  const platform = process.platform;
  const arch = process.arch;

  const osMap: Record<string, string> = {
    darwin: 'darwin',
    linux: 'linux',
    win32: 'windows',
  };

  const archMap: Record<string, string> = {
    x64: 'amd64',
    arm64: 'arm64',
  };

  const os = osMap[platform];
  const cpuArch = archMap[arch];

  if (!os || !cpuArch) {
    throw new Error(`Unsupported platform: ${platform} ${arch}`);
  }

  return {
    os,
    arch: cpuArch,
    ext: os === 'windows' ? 'zip' : 'tar.gz',
  };
}

/**
 * Get executable name for current platform
 */
function getExecutableName(): string {
  return process.platform === 'win32' ? 'cli-proxy-api-plus.exe' : 'cli-proxy-api-plus';
}

/**
 * Get full path to binary
 */
export function getBinaryPath(): string {
  return path.join(getBinDir(), getExecutableName());
}

/**
 * Check if binary is installed
 */
export function isBinaryInstalled(): boolean {
  return fs.existsSync(getBinaryPath());
}

/**
 * Download file with redirect following
 */
function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      // Follow redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(dest);
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * Extract tar.gz archive
 */
async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', archivePath, '-C', destDir], { stdio: 'inherit' });
    tar.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`tar extract failed with code ${code}`));
    });
    tar.on('error', reject);
  });
}

/**
 * Extract zip archive (for Windows in Docker - unlikely but handle it)
 */
async function extractZip(archivePath: string, destDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-o', archivePath, '-d', destDir], { stdio: 'inherit' });
    unzip.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`unzip failed with code ${code}`));
    });
    unzip.on('error', reject);
  });
}

/**
 * Download and install CLIProxy binary
 */
export async function installBinary(): Promise<string> {
  const binDir = getBinDir();
  fs.mkdirSync(binDir, { recursive: true });

  const platform = detectPlatform();
  const binaryName = `CLIProxyAPIPlus_${CLIPROXY_VERSION}_${platform.os}_${platform.arch}.${platform.ext}`;
  const downloadUrl = `${GITHUB_RELEASES_BASE}/v${CLIPROXY_VERSION}/${binaryName}`;
  const archivePath = path.join(binDir, binaryName);

  console.log(`[cliproxy] Downloading ${binaryName}...`);
  await downloadFile(downloadUrl, archivePath);

  console.log('[cliproxy] Extracting...');
  if (platform.ext === 'tar.gz') {
    await extractTarGz(archivePath, binDir);
  } else {
    await extractZip(archivePath, binDir);
  }

  // Cleanup archive
  fs.unlinkSync(archivePath);

  // Set executable permission
  const binaryPath = getBinaryPath();
  if (process.platform !== 'win32') {
    fs.chmodSync(binaryPath, 0o755);
  }

  console.log(`[cliproxy] Installed: ${binaryPath}`);
  return binaryPath;
}

/**
 * Ensure binary is installed
 */
export async function ensureBinary(): Promise<string> {
  if (isBinaryInstalled()) {
    return getBinaryPath();
  }
  return installBinary();
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

