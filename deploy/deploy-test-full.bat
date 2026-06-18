@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
set SSH_KEY=C:\Users\a8466\.ssh\id_rsa_nas
set NAS=syadmin@192.168.0.200
set TEST=/volume1/docker/huakey-crm-deploy/test
set LOCAL=C:\huakey-crm

echo ========================================
echo  Huakey CRM: Full Deploy Local -^> Test
echo  (Code + Database)
echo ========================================
echo.

REM 检查本地数据库密码
if "%DB_PASS%"=="" (
    set /p DB_PASS="Enter local MySQL root password: "
)

cd /d "%LOCAL%"

REM ============ 1. 同步后端代码 ============
echo [1/6] Syncing backend...
tar czf - --exclude=node_modules --exclude=.git --exclude=logs --exclude=backups --exclude=uploads --exclude=*.tar.gz backend | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "tar xzf - -C %TEST%"
if errorlevel 1 (
    echo ERROR: backend sync failed
    pause
    exit /b 1
)
echo Done.

REM ============ 2. 构建并同步前端 ============
echo.
echo [2/6] Building frontend...
cd /d "%LOCAL%\frontend"
call npm run build
if errorlevel 1 (
    echo ERROR: frontend build failed
    cd /d "%LOCAL%"
    pause
    exit /b 1
)
cd /d "%LOCAL%"

echo.
echo [3/6] Syncing frontend...
tar czf - -C frontend dist | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "mkdir -p %TEST%/frontend && tar xzf - -C %TEST%/frontend"
if errorlevel 1 (
    echo ERROR: frontend sync failed
    pause
    exit /b 1
)
echo Done.

REM ============ 4. 同步迁移和种子数据 ============
echo.
echo [4/6] Syncing database files...
tar czf - -C database migrations seeds | ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "mkdir -p %TEST%/database && tar xzf - -C %TEST%/database"
echo Done.

REM ============ 5. 导出本地数据库并导入到test ============
echo.
echo [5/6] Exporting local database...
cd /d "%LOCAL%"

REM 导出本地数据库（排除数据量大的日志表）
mysqldump -u root -p%DB_PASS% --single-transaction --routines --triggers --ignore-table=huakey_crm.sys_log --ignore-table=huakey_crm.crm_follow_up --ignore-table=huakey_crm.crm_email --ignore-table=huakey_crm.crm_email_attachment huakey_crm > "%TEMP%\huakey_crm_dump.sql"
if errorlevel 1 (
    echo ERROR: database export failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [5/6] Uploading database to NAS...
scp -i "%SSH_KEY%" -o StrictHostKeyChecking=no "%TEMP%\huakey_crm_dump.sql" %NAS%:%TEST%/database/
if errorlevel 1 (
    echo ERROR: database upload failed
    pause
    exit /b 1
)
echo Done.

REM ============ 6. 重启容器并导入数据库 ============
echo.
echo [6/6] Restarting containers and importing database...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "cd %TEST% && docker compose -f docker-compose.synology.yml restart && sleep 30 && docker exec -i crm-test-mysql mysql -u root huakey_crm < %TEST%/database/huakey_crm_dump.sql"
if errorlevel 1 (
    echo WARNING: restart or import may have failed, check Container Manager
)
echo Done.

REM ============ 清理 ============
del "%TEMP%\huakey_crm_dump.sql" 2>nul

echo.
echo ========================================
echo  Full deploy complete!
echo.
echo  Visit: http://192.168.0.200:6790
echo  Login: admin / huakey123
echo ========================================
pause
