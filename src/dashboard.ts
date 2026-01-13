/**
 * CCS Remote - Dashboard UI
 * 
 * Simple HTML dashboard for monitoring the remote proxy server
 */

import { Router, Request, Response } from 'express';
import { loadConfig } from './config';
import { listAuthFiles } from './auth-manager';
import { isProxyRunning, getProxyStatus } from './cliproxy-manager';

const router = Router();
const startTime = Date.now();

/**
 * Generate dashboard HTML
 */
async function generateDashboardHtml(): Promise<string> {
  const config = loadConfig();
  const authFiles = listAuthFiles();
  const proxyRunning = await isProxyRunning();
  const proxyStatus = getProxyStatus();
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  
  // Count stats
  const totalAccounts = authFiles.length;
  const expiredAccounts = authFiles.filter(f => f.account.isExpired).length;
  const activeAccounts = totalAccounts - expiredAccounts;
  
  // Provider stats
  const providerCounts: Record<string, number> = {};
  for (const file of authFiles) {
    providerCounts[file.provider] = (providerCounts[file.provider] || 0) + 1;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CCS Remote Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117; color: #c9d1d9; line-height: 1.5; padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #58a6ff; margin-bottom: 20px; display: flex; align-items: center; gap: 12px; }
    h2 { color: #8b949e; margin: 20px 0 12px; font-size: 14px; text-transform: uppercase; }
    .logo { font-size: 32px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; }
    .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 16px; }
    .stat { font-size: 32px; font-weight: 600; color: #58a6ff; }
    .stat.green { color: #3fb950; }
    .stat.red { color: #f85149; }
    .stat.yellow { color: #d29922; }
    .label { color: #8b949e; font-size: 13px; margin-top: 4px; }
    .status { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
      border-radius: 16px; font-size: 12px; font-weight: 500; }
    .status.healthy { background: #238636; color: #fff; }
    .status.degraded { background: #9e6a03; color: #fff; }
    .status.unhealthy { background: #da3633; color: #fff; }
    .dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #21262d; }
    th { color: #8b949e; font-weight: 500; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; 
      background: #21262d; color: #8b949e; }
    .badge.active { background: #238636; color: #fff; }
    .badge.expired { background: #da3633; color: #fff; }
    .refresh-btn { background: #238636; color: #fff; border: none; padding: 8px 16px;
      border-radius: 6px; cursor: pointer; font-size: 13px; }
    .refresh-btn:hover { background: #2ea043; }
    .footer { margin-top: 40px; text-align: center; color: #484f58; font-size: 12px; }
    .actions { display: flex; gap: 8px; margin-top: 12px; }
    .btn { padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; border: none; }
    .btn-start { background: #238636; color: #fff; }
    .btn-stop { background: #da3633; color: #fff; }
    .btn-refresh { background: #21262d; color: #c9d1d9; border: 1px solid #30363d; }
  </style>
  <script>
    async function apiCall(endpoint, method = 'GET') {
      const token = localStorage.getItem('ccs_api_key') || prompt('Enter API key:');
      if (!token) return;
      localStorage.setItem('ccs_api_key', token);
      try {
        const res = await fetch('/api' + endpoint, {
          method,
          headers: { 'Authorization': 'Bearer ' + token }
        });
        const data = await res.json();
        alert(data.message || JSON.stringify(data));
        if (method !== 'GET') location.reload();
      } catch (e) { alert('Error: ' + e.message); }
    }
    function refreshPage() { location.reload(); }
    setInterval(refreshPage, 30000); // Auto-refresh every 30s
  </script>
</head>
<body>
  <div class="container">
    <h1><span class="logo">🚀</span> CCS Remote Dashboard</h1>
    
    <h2>System Status</h2>
    <div class="grid">
      <div class="card">
        <span class="status ${proxyRunning ? 'healthy' : 'unhealthy'}">
          <span class="dot"></span> ${proxyRunning ? 'Healthy' : 'Unhealthy'}
        </span>
        <div class="stat ${proxyRunning ? 'green' : 'red'}" style="margin-top:12px">
          ${proxyRunning ? 'Online' : 'Offline'}
        </div>
        <div class="label">CLIProxy Status${proxyStatus.pid ? ' (PID: ' + proxyStatus.pid + ')' : ''}</div>
        <div class="actions">
          <button class="btn btn-start" onclick="apiCall('/cliproxy/start', 'POST')">Start</button>
          <button class="btn btn-stop" onclick="apiCall('/cliproxy/stop', 'POST')">Stop</button>
        </div>
      </div>
      <div class="card">
        <div class="stat green">${activeAccounts}</div>
        <div class="label">Active Accounts</div>
      </div>
      <div class="card">
        <div class="stat ${expiredAccounts > 0 ? 'yellow' : ''}">${expiredAccounts}</div>
        <div class="label">Expired Tokens</div>
      </div>
      <div class="card">
        <div class="stat">${formatUptime(uptimeSeconds)}</div>
        <div class="label">Server Uptime</div>
      </div>
    </div>

    <h2>Accounts by Provider</h2>
    <div class="grid">
      ${Object.entries(providerCounts).map(([provider, count]) => `
        <div class="card">
          <div class="stat">${count}</div>
          <div class="label">${provider.toUpperCase()}</div>
        </div>
      `).join('') || '<div class="card"><div class="label">No accounts found</div></div>'}
    </div>

    <h2>Account Details</h2>
    <div class="card" style="overflow-x:auto">
      <table>
        <thead>
          <tr><th>Email</th><th>Provider</th><th>Status</th><th>Expires</th></tr>
        </thead>
        <tbody>
          ${authFiles.map(f => `
            <tr>
              <td>${f.account.email}</td>
              <td><span class="badge">${f.provider}</span></td>
              <td><span class="badge ${f.account.isExpired ? 'expired' : 'active'}">
                ${f.account.isExpired ? 'Expired' : 'Active'}</span></td>
              <td>${f.account.expiresAt || 'N/A'}</td>
            </tr>
          `).join('') || '<tr><td colspan="4" style="text-align:center">No accounts configured</td></tr>'}
        </tbody>
      </table>
    </div>

    <h2>Connection Info</h2>
    <div class="card">
      <pre style="color:#8b949e;font-size:12px;overflow-x:auto">
ANTHROPIC_BASE_URL=http://YOUR_SERVER_IP:${config.port}/proxy/api/provider/agy
ANTHROPIC_AUTH_TOKEN=${config.apiKey}
      </pre>
    </div>

    <div class="footer">
      <button class="btn btn-refresh" onclick="refreshPage()">🔄 Refresh</button>
      <p style="margin-top:12px">CCS Remote v1.0.0 • Port ${config.port}</p>
    </div>
  </div>
</body>
</html>`;
}

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

/**
 * GET /dashboard - Main dashboard page
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const html = await generateDashboardHtml();
    res.type('html').send(html);
  } catch (error) {
    res.status(500).send('Error generating dashboard: ' + (error as Error).message);
  }
});

export default router;

