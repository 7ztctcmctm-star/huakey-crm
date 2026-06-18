@echo off
set SSH_KEY=C:\Users\a8466\.ssh\id_rsa_nas
set NAS=syadmin@192.168.0.200
set TEST=/volume1/docker/huakey-crm-deploy/test
set LOCAL=C:\huakey-crm

echo ========================================
echo  Huakey CRM Deploy: Local -^> Test
echo ========================================
echo.

echo [1/4] Syncing backend (tar over SSH)...
cd /d "%LOCAL%"
tar czf - --exclude=node_modules --exclude=.git --exclude=logs --exclude=backups --exclude=uploads backend | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "tar xzf - -C %TEST%"
if errorlevel 1 (
    echo ERROR: backend sync failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [2/4] Building frontend...
cd /d "%LOCAL%\frontend"
call npm run build
if errorlevel 1 (
    echo ERROR: build failed
    cd /d "%LOCAL%"
    pause
    exit /b 1
)
cd /d "%LOCAL%"
echo Done.

echo.
echo [3/4] Syncing frontend...
tar czf - -C frontend dist | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "mkdir -p %TEST%/frontend && tar xzf - -C %TEST%/frontend"
if errorlevel 1 (
    echo ERROR: frontend sync failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [4/4] Syncing migrations...
tar czf - -C database migrations | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "mkdir -p %TEST%/database && tar xzf - -C %TEST%/database"
echo Done.

echo.
echo ========================================
echo  Code synced!
echo  Restart crm-test-app in Container Manager
echo  Visit: http://192.168.0.200:6790
echo ========================================
pause
