# CCS Remote - Hướng dẫn Deploy

## Mục lục
- [Deploy lần đầu (Build from scratch)](#deploy-lần-đầu-build-from-scratch)
- [Update khi có code mới](#update-khi-có-code-mới)
- [Troubleshooting](#troubleshooting)

---

## Deploy lần đầu (Build from scratch)

### Bước 1: Clone repository

```bash
cd /www/wwwroot
git clone https://github.com/duogxaolin/ccs.git
cd ccs/ccs
```

### Bước 2: Tải CLIProxy binary

```bash
mkdir -p bin
cd bin
wget https://github.com/router-for-me/CLIProxyAPIPlus/releases/download/v6.6.40-0/CLIProxyAPIPlus_6.6.40-0_linux_amd64.tar.gz
tar -xzf CLIProxyAPIPlus_6.6.40-0_linux_amd64.tar.gz
chmod +x cli-proxy-api-plus
ls -la
cd ..
```

> **Lưu ý:** Nếu wget bị chặn, tải file từ Windows rồi upload lên VPS qua aaPanel File Manager.

### Bước 3: Tạo folder data và copy auth files

```bash
mkdir -p data/cliproxy/auth
```

Copy auth files từ Windows (chạy trên PowerShell):
```powershell
scp C:\Users\<YourUser>\.ccs\cliproxy\auth\*.json root@YOUR_VPS_IP:/www/wwwroot/ccs/ccs/data/cliproxy/auth/
```

Hoặc upload qua aaPanel File Manager từ:
- Source: `C:\Users\<YourUser>\.ccs\cliproxy\auth\`
- Destination: `/www/wwwroot/ccs/ccs/data/cliproxy/auth/`

### Bước 4: Cấu hình environment (tùy chọn)

```bash
cp .env.example .env
nano .env
```

Các biến quan trọng:
```env
CCS_API_KEY=your-secure-api-key-here
CCS_MANAGEMENT_KEY=your-management-key-here
OAUTH_CALLBACK_URL=http://YOUR_SERVER_IP:8318/oauth
```

### Bước 5: Build và chạy Docker

```bash
docker-compose build --no-cache
docker-compose up -d
docker-compose logs -f
```

### Bước 6: Kiểm tra hoạt động

```bash
# Health check
curl http://localhost:8318/health

# Xem dashboard
# Mở browser: http://YOUR_SERVER_IP:8318/
```

---

## Update khi có code mới

### Cách 1: Update nhanh (không xóa cache)

```bash
cd /www/wwwroot/ccs/ccs
docker-compose down
git pull
docker-compose up -d
docker-compose logs -f
```

### Cách 2: Update sạch (xóa cache, rebuild hoàn toàn)

```bash
cd /www/wwwroot/ccs/ccs

# Dừng container
docker-compose down

# Pull code mới
git pull

# Xóa image cũ và cache
docker rmi ccs-ccs-remote 2>/dev/null || true
docker builder prune -f

# Build lại từ đầu
docker-compose build --no-cache

# Chạy
docker-compose up -d

# Xem logs
docker-compose logs -f
```

### One-liner update sạch:

```bash
cd /www/wwwroot/ccs/ccs && docker-compose down && git pull && docker rmi ccs-ccs-remote 2>/dev/null; docker builder prune -f && docker-compose build --no-cache && docker-compose up -d && docker-compose logs -f
```

---

## Troubleshooting

### Lỗi: CLIProxy binary not found

Kiểm tra binary đã được mount đúng chưa:
```bash
ls -la bin/
docker-compose exec ccs-remote ls -la /app/bin/
```

Nếu chưa có, tải lại binary (xem Bước 2).

### Lỗi: No auth files found

Kiểm tra auth files:
```bash
ls -la data/cliproxy/auth/
```

Copy lại từ Windows nếu cần.

### Lỗi: Permission denied

```bash
chmod +x bin/cli-proxy-api-plus
chmod -R 755 data/
```

### Xem logs chi tiết

```bash
# Xem logs realtime
docker-compose logs -f

# Xem 100 dòng cuối
docker-compose logs --tail=100

# Xem logs của 1 giờ trước
docker-compose logs --since="1h"
```

### Restart container

```bash
docker-compose restart
```

### Xóa hoàn toàn và làm lại

```bash
docker-compose down -v
docker rmi ccs-ccs-remote
docker builder prune -af
# Sau đó làm lại từ Bước 5
```

---

## Cấu hình Claude Code trên Windows

Sau khi deploy xong, cấu hình Claude Code:

```powershell
$env:ANTHROPIC_BASE_URL = "http://YOUR_SERVER_IP:8318/proxy/api/provider/agy"
$env:ANTHROPIC_AUTH_TOKEN = "ccs-remote-key"
claude
```

Hoặc với các provider khác:
- `agy` - Antigravity
- `codex` - OpenAI Codex
- `gemini` - Google Gemini
- `ghcp` - GitHub Copilot
- `qwen` - Alibaba Qwen
- `kiro` - AWS Kiro

---

## Cấu trúc thư mục

```
/www/wwwroot/ccs/ccs/
├── bin/
│   └── cli-proxy-api-plus    # CLIProxy binary
├── data/
│   └── cliproxy/
│       └── auth/             # Auth JSON files
│           ├── antigravity-email@gmail.com.json
│           ├── codex-email@gmail.com.json
│           └── ...
├── src/                      # Source code
├── ui/                       # React dashboard UI
├── dist/                     # Compiled output
├── docker-compose.yml
├── Dockerfile
├── .env                      # Environment config
└── build.md                  # This file
```
