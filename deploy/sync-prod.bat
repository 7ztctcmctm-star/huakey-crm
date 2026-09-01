@echo off
chcp 65001 >nul 2>&1
setlocal
set NAS=nas-crm
set REMOTE=/volume1/docker/crm-stack
set LOCAL=C:\huakey-crm

echo ================================================
echo   Huakey CRM prod sync + redeploy
echo ================================================

echo [0/5] Check SSH connectivity...
ssh -o BatchMode=yes -o ConnectTimeout=8 %NAS% "echo SSH_OK" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] SSH connection failed
  pause
  exit /b 1
)
echo    SSH OK.

cd /d "%LOCAL%"

echo [1/5] Sync backend...
tar czf - --exclude=node_modules --exclude=logs --exclude=uploads --exclude=backups --exclude=coverage --exclude=tmp --exclude=.vercel --exclude=.env.local --exclude=.env.production.local backend | ssh %NAS% "tar xzf - -C %REMOTE%"
if errorlevel 1 (
  echo [ERROR] backend sync failed
  pause
  exit /b 1
)

echo [2/5] Sync frontend...
tar czf - --exclude=node_modules --exclude=dist --exclude=test-results --exclude=.vercel frontend | ssh %NAS% "tar xzf - -C %REMOTE%"
if errorlevel 1 (
  echo [ERROR] frontend sync failed
  pause
  exit /b 1
)

echo [3/5] Sync database...
tar czf - --exclude=backups database | ssh %NAS% "tar xzf - -C %REMOTE%"
if errorlevel 1 (
  echo [ERROR] database sync failed
  pause
  exit /b 1
)

echo [4/5] Sync config (compose / nginx / deploy)...
tar czf - docker-compose.synology.yml Dockerfile.synology nginx/nginx.conf deploy/deploy.sh deploy/inject-secrets.sh deploy/init-complete.sql deploy/validate-env.js | ssh %NAS% "tar xzf - -C %REMOTE%"
if errorlevel 1 (
  echo [ERROR] config sync failed
  pause
  exit /b 1
)

echo [5/5] Redeploy on NAS (rebuild image + close 6789)...
ssh %NAS% "cd %REMOTE% && export PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH && set -a && . ./.env.secrets && set +a && docker compose -f docker-compose.synology.yml --env-file .env up -d --build"

echo.
echo ================================================
echo   Done. Verify with:
echo     ssh %NAS% "docker compose -f %REMOTE%/docker-compose.synology.yml ps"
echo     ssh %NAS% "curl -sk https://localhost:8443/api/v1/health"
echo ================================================
pause
