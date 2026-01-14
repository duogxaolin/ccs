# 1. Dừng container (Ctrl+C trước nếu đang xem logs)
docker-compose down

# 2. Pull code mới (có fix docker-compose.yml)
git pull

# 3. Kiểm tra folder bin và binary
ls -la bin/

# 4. Nếu chưa có binary, tải lại:
cd bin
wget https://github.com/router-for-me/CLIProxyAPIPlus/releases/download/v6.6.40-0/CLIProxyAPIPlus_6.6.40-0_linux_amd64.tar.gz
tar -xzf CLIProxyAPIPlus_6.6.40-0_linux_amd64.tar.gz
chmod +x cli-proxy-api-plus
ls -la
cd ..

# 5. Kiểm tra docker-compose.yml có mount bin chưa
cat docker-compose.yml | grep -A2 volumes

# 6. Restart docker
docker-compose up -d
docker-compose logs -f
