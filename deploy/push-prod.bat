@echo off
chcp 65001 >nul 2>&1
set SSH_KEY=C:\Users\a8466\.ssh\id_rsa_nas
set NAS=syadmin@192.168.0.200
set TEST=/volume1/docker/huakey-crm-deploy/test
set PROD=/volume1/docker/huakey-crm-deploy/prod

echo ========================================
echo  Huakey CRM Deploy: Test -^> Prod
echo ========================================
echo.
echo WARNING: Confirm test env is verified!
echo          http://192.168.0.200:6790
echo.
echo Press any key to continue, Ctrl+C to cancel...
pause >nul

echo.
echo [1/3] Syncing backend to prod...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "tar czf - -C %TEST% backend --exclude=node_modules --exclude=.git --exclude=logs --exclude=backups --exclude=uploads --exclude=*.tar.gz | tar xzf - -C %PROD%"
if errorlevel 1 (
    echo ERROR: backend sync failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [2/3] Syncing frontend to prod...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "tar czf - -C %TEST%/frontend dist | tar xzf - -C %PROD%/frontend"
if errorlevel 1 (
    echo ERROR: frontend sync failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [3/3] Syncing migrations to prod...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "tar czf - -C %TEST%/database migrations | tar xzf - -C %PROD%/database"
echo Done.

echo.
echo ========================================
echo  Code pushed to prod!
echo.
echo  NOTE: If package.json changed (new deps),
echo        manually run npm install in Container
echo        Manager terminal for crm-prod-app:
echo        cd /app ^&^& npm install --production
echo.
echo  Restart crm-prod-app in Container Manager
echo  Visit: https://^<your-domain^>  (生产环境请通过 Nginx 443 访问)
echo ========================================
pause
