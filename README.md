# CCS Remote

Remote proxy server for CCS (Claude Code Switch). Deploy CLIProxy on a VPS and access Claude Code from anywhere.

## Features

- **Remote CLIProxy**: Run CLIProxy on a VPS, connect from any machine
- **Multi-Account Support**: Multiple OAuth accounts per provider with auto-switching
- **Auto Account Switching**: Automatically switch accounts on 429 (quota exceeded) errors
- **OAuth Token Injection**: Automatically injects OAuth tokens from auth files
- **Token Refresh**: Automatic OAuth token refresh before expiry
- **Dashboard UI**: Web-based monitoring dashboard
- **Docker Ready**: Easy deployment with Docker and docker-compose
- **Startup Validation**: Helpful warnings if configuration is incomplete

## Quick Start

### Prerequisites

- Node.js 18+ or Docker
- CLIProxy binary (cli-proxy-api-plus)
- Auth files from your Windows `.ccs/cliproxy/auth/` folder

### Local Development

```bash
npm install
npm run build
npm start
```

### Docker Deployment

```bash
docker build -t ccs-remote .
docker run -d -p 8318:8318 -v ./data:/app/data -v ./bin:/app/bin ccs-remote
```

## Setup Steps

### Step 1: Download CLIProxy Binary

Download the CLIProxy binary for your platform:

1. Go to: https://github.com/router-for-me/CLIProxyAPIPlus/releases
2. Download the appropriate version for your server (e.g., `CLIProxyAPIPlus_x.x.x_linux_amd64.tar.gz`)
3. Extract and place in `./bin/cli-proxy-api-plus`
4. Make executable: `chmod +x ./bin/cli-proxy-api-plus`

Alternatively, set `CLIPROXY_BIN_PATH` environment variable to the binary location.

### Step 2: Copy Auth Files from Windows

1. On your Windows machine, locate the CCS auth folder:
   ```
   C:\Users\<YourUser>\.ccs\cliproxy\auth\
   ```

2. Copy all `.json` files to your VPS:
   ```bash
   scp C:\Users\<YourUser>\.ccs\cliproxy\auth\*.json user@your-vps:/opt/ccs-remote/data/cliproxy/auth/
   ```

3. Alternatively, use SCP/SFTP to copy files:
   - Source: `%USERPROFILE%\.ccs\cliproxy\auth\`
   - Destination: `/opt/ccs-remote/data/cliproxy/auth/`

### Step 3: Configure Environment

Create `.env` file:
```bash
cp .env.example .env
nano .env
```

Edit values (IMPORTANT - change default keys!):
```env
CCS_API_KEY=your-secure-api-key-here
CCS_MANAGEMENT_KEY=your-management-key-here
CCS_DATA_DIR=/app/data
```

### Step 4: Start Server

```bash
npm start
# Or with Docker:
docker-compose up -d
```

## aaPanel Deployment Guide

### Step 1: Install Docker on aaPanel

1. Login to aaPanel
2. Go to Docker Manager → Install Docker

### Step 2: Upload CCS Remote

```bash
cd /opt
git clone https://github.com/duogxaolin/ccs.git ccs-remote
cd ccs-remote/ccs-remote
```

### Step 3: Download CLIProxy Binary

```bash
mkdir -p bin
cd bin
wget https://github.com/router-for-me/CLIProxyAPIPlus/releases/download/v1.0.0/CLIProxyAPIPlus_1.0.0_linux_amd64.tar.gz
tar -xzf CLIProxyAPIPlus_*.tar.gz
chmod +x cli-proxy-api-plus
cd ..
```

### Step 4: Configure and Deploy

```bash
cp .env.example .env
nano .env  # Edit your settings
docker-compose up -d
```

### Step 5: Configure Nginx Reverse Proxy

In aaPanel:
1. Go to Website → Add Site
2. Domain: `ccs.yourdomain.com`
3. Go to site settings → Reverse Proxy → Add
4. Configure:
   - Proxy Name: ccs
   - Target URL: `http://127.0.0.1:8318`
   - Enable WebSocket

### Step 6: Enable SSL (Recommended)

1. In aaPanel site settings → SSL
2. Apply for Let's Encrypt certificate
3. Enable Force HTTPS

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CCS_PORT` | `8318` | Server port |
| `CCS_HOST` | `0.0.0.0` | Bind address |
| `CCS_DATA_DIR` | `/app/data` | Data directory |
| `CCS_API_KEY` | `ccs-remote-key` | API key for proxy access |
| `CCS_MANAGEMENT_KEY` | `ccs-remote-mgmt` | Key for management endpoints |
| `CCS_CLIPROXY_PORT` | `8317` | CLIProxy internal port |
| `CCS_CORS_ORIGINS` | `*` | Allowed CORS origins |
| `CLIPROXY_BIN_PATH` | (auto-detect) | Custom path to CLIProxy binary |
| `BIND_HOST` | `0.0.0.0` | CLIProxy bind address |
| `API_KEY_REQUIRED` | `true` | Require API key for all requests |
| `API_KEYS` | (empty) | Additional comma-separated API keys |

## Claude Code Configuration

Set these environment variables in your Claude Code client:

```bash
export ANTHROPIC_BASE_URL=https://ccs.yourdomain.com/proxy/api/provider/agy
export ANTHROPIC_AUTH_TOKEN=your-api-key-here
```

For other providers, change `agy` to: `gemini`, `codex`, `qwen`, `iflow`, `kiro`, `ghcp`

## API Endpoints

### Health & Status

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | No | Health check |
| `/dashboard` | GET | No | Web dashboard |

### Proxy Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/proxy/api/provider/{provider}/*` | ALL | API Key | Forward to CLIProxy |
| `/proxy/v1/*` | ALL | API Key | OpenAI-compatible endpoints |

### Account Management

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/accounts/status` | GET | API Key | Get all account status |
| `/api/accounts/{provider}` | GET | API Key | Get accounts for provider |
| `/api/accounts/{provider}/switch` | POST | API Key | Switch active account |
| `/api/accounts/{provider}/next` | POST | API Key | Switch to next account |
| `/api/accounts/clear-quota` | POST | API Key | Clear quota exceeded flags |

### Token Management

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/tokens/status` | GET | API Key | Token expiration status |
| `/api/tokens/refresh` | POST | API Key | Manual token refresh |
| `/api/tokens/auto-refresh/start` | POST | API Key | Start auto-refresh |
| `/api/tokens/auto-refresh/stop` | POST | API Key | Stop auto-refresh |

### Statistics

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/stats` | GET | API Key | Usage statistics |
| `/api/quota` | GET | API Key | Quota information |
| `/api/stats/reset` | POST | API Key | Reset statistics |

### CLIProxy Control

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/cliproxy/status` | GET | API Key | CLIProxy status |
| `/api/cliproxy/start` | POST | API Key | Start CLIProxy |
| `/api/cliproxy/stop` | POST | API Key | Stop CLIProxy |

## Supported Providers

- `agy` - Antigravity (Claude via Google)
- `gemini` - Google Gemini
- `codex` - OpenAI Codex
- `qwen` - Alibaba Qwen
- `iflow` - iFlow
- `kiro` - Kiro
- `ghcp` - GitHub Copilot

## Account Switching

CCS Remote supports automatic account switching when quota is exceeded:

1. **Manual Switch**: Use `/api/accounts/{provider}/switch` with account email
2. **Auto Switch**: When a 429 error is received, automatically tries next account
3. **Quota Tracking**: Accounts with quota exceeded are tracked for 24 hours

Example - Switch to specific account:
```bash
curl -X POST https://ccs.yourdomain.com/api/accounts/agy/switch \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"email": "account@example.com"}'
```

## License

MIT

