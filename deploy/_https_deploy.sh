#!/bin/bash
# HTTPS 部署脚本：Docker nginx 容器 + 自签证书
set -e
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
cd /volume1/docker/crm-stack

echo "=== 1. 生成自签证书 ==="
mkdir -p nginx/certs
docker run --rm -v /volume1/docker/crm-stack/nginx/certs:/certs alpine sh -c "
  apk add --no-cache openssl >/dev/null 2>&1
  openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /certs/server.key \
    -out /certs/server.crt \
    -subj '/C=CN/ST=GuangDong/L=ShenZhen/O=Huakey/CN=192.168.0.200' \
    -addext 'subjectAltName=IP:192.168.0.200'
  chmod 600 /certs/server.key
  chmod 644 /certs/server.crt
  echo '证书生成完成'
  openssl x509 -in /certs/server.crt -noout -subject -dates
"

echo ""
echo "=== 2. 创建 nginx 配置 ==="
mkdir -p nginx
cat > nginx/nginx.conf << 'NGINXCONF'
server {
    listen 8443 ssl;
    http2 on;
    server_name 192.168.0.200 _;

    # SSL 证书
    ssl_certificate /etc/nginx/certs/server.crt;
    ssl_certificate_key /etc/nginx/certs/server.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # 安全头
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-XSS-Protection "1; mode=block";

    # 请求大小限制
    client_max_body_size 50m;

    # 反向代理到 App
    location / {
        proxy_pass http://app:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket 支持
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
NGINXCONF
echo "nginx 配置已创建"

echo ""
echo "=== 3. 备份 docker-compose.synology.yml ==="
cp docker-compose.synology.yml docker-compose.synology.yml.bak.$(date +%Y%m%d_%H%M%S)

echo ""
echo "=== 4. 添加 nginx 服务到 docker-compose ==="
# 检查是否已存在 nginx 服务
if grep -q "huakey-nginx" docker-compose.synology.yml; then
  echo "nginx 服务已存在，跳过"
else
  # 在 volumes: 之前插入 nginx 服务
  sed -i '/^volumes:/i\
  # ---- HTTPS 反向代理 ----\
  nginx:\
    image: nginx:alpine\
    container_name: huakey-nginx\
    restart: unless-stopped\
    mem_limit: 128m\
    ports:\
      - "8443:8443"\
    volumes:\
      - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro\
      - ./nginx/certs:/etc/nginx/certs:ro\
    depends_on:\
      app:\
        condition: service_healthy\
    healthcheck:\
      test: ["CMD", "wget", "-qO-", "https://localhost:8443/api/v1/health", "--no-check-certificate"]\
      interval: 30s\
      timeout: 5s\
      retries: 3\
      start_period: 10s\
    networks:\
      - crm-network\
' docker-compose.synology.yml
  echo "nginx 服务已添加"
fi

echo ""
echo "=== 5. 修改 CORS_ORIGIN ==="
set -a
. ./.env.secrets
set +a

python3 -c "
import os, re
with open('.env', 'r') as f:
    content = f.read()
content = re.sub(r'^CORS_ORIGIN=.*$', 'CORS_ORIGIN=https://192.168.0.200:8443', content, flags=re.MULTILINE)
with open('.env', 'w') as f:
    f.write(content)
print('CORS_ORIGIN 已更新')
"
grep '^CORS_ORIGIN=' .env

echo ""
echo "=== 6. 验证 docker-compose 配置 ==="
docker compose -f docker-compose.synology.yml config --quiet 2>&1 && echo "配置有效" || echo "配置有误"

echo ""
echo "=== 7. 启动 nginx 容器 ==="
docker compose -f docker-compose.synology.yml up -d nginx 2>&1

echo ""
echo "=== 8. 重启 App 容器（应用新 CORS_ORIGIN）==="
docker compose -f docker-compose.synology.yml restart app 2>&1

echo ""
echo "=== 9. 等待服务启动（15 秒）==="
sleep 15

echo ""
echo "=== 10. 检查容器状态 ==="
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>&1

echo ""
echo "=== 11. 测试 HTTPS ==="
echo "--- HTTPS 健康检查 ---"
curl -sk https://localhost:8443/api/v1/health 2>&1 | head -c 200
echo ""
echo "--- HTTPS 前端页面 ---"
curl -sk -o /dev/null -w "HTTP_CODE:%{http_code} SIZE:%{size_download}" https://localhost:8443/ 2>&1
echo ""

echo ""
echo "=== 12. App 日志 ==="
docker logs huakey-app --tail 10 2>&1

echo ""
echo "=== HTTPS 部署完成 ==="
