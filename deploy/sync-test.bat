@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
set SSH_KEY=C:\Users\a8466\.ssh\id_rsa_nas
set NAS=syadmin@192.168.0.200
set TEST=/volume1/docker/huakey-crm-deploy/test
set LOCAL=C:\huakey-crm

echo ========================================
echo  Huakey CRM Deploy: Local -^> Test
echo ========================================
echo.

REM Check if local git is clean before syncing
echo [0/6] Checking local git status...
cd /d "%LOCAL%"
git diff --quiet
if errorlevel 1 (
    echo.
    echo WARNING: Local git has uncommitted changes!
    echo          Consider committing before deploy.
    echo.
    set /p CONTINUE="Continue anyway? (y/N): "
    if /i not "!CONTINUE!"=="y" (
        echo Deploy cancelled.
        pause
        exit /b 0
    )
)
echo Git status OK.
echo.

echo [1/6] Syncing backend (tar over SSH)...
cd /d "%LOCAL%"
tar czf - --exclude=node_modules --exclude=.git --exclude=logs --exclude=backups --exclude=uploads --exclude=*.tar.gz backend | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "tar xzf - -C %TEST%"
if errorlevel 1 (
    echo ERROR: backend sync failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [2/6] Building frontend...
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
echo [3/6] Syncing frontend...
tar czf - -C frontend dist | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "mkdir -p %TEST%/frontend && tar xzf - -C %TEST%/frontend"
if errorlevel 1 (
    echo ERROR: frontend sync failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [4/6] Syncing migrations...
tar czf - -C database migrations | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "mkdir -p %TEST%/database && tar xzf - -C %TEST%/database"
echo Done.

echo.
echo [5/6] Syncing seed data...
tar czf - -C database seeds | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "mkdir -p %TEST%/database && tar xzf - -C %TEST%/database"
echo Done.

echo.
echo [6/6] Syncing deploy configs...
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no "%LOCAL%\deploy\docker-compose.test.yml" %NAS%:%TEST%/docker-compose.yml
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no "%LOCAL%\deploy\synology\Dockerfile.synology" %NAS%:/volume1/docker/huakey-crm-deploy/Dockerfile.synology
echo Done.

echo.
echo ========================================
echo  Code synced!
echo.
echo  Next steps:
echo  1. Open Container Manager
echo  2. Stop and recreate the test project
echo     (docker-compose.yml updated with Redis)
echo  3. Visit: http://192.168.0.200:6790  (测试环境直连后端端口)
echo  4. Check Settings: Redis should show green
echo.
echo  IMPORTANT: If this is a fresh deploy,
echo  run seed data in Container Manager:
echo    docker exec crm-test-mysql mysql -u root -p huakey_crm ^< /volume1/docker/huakey-crm-deploy/test/database/seeds/seed_test_data.sql
echo.
echo  Note: 首次登录请使用管理员账号，系统会强制修改初始密码
echo ========================================
pause
