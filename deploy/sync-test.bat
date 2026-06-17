@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  铧旗CRM 部署脚本: 本地 → 测试环境
echo ============================================
echo.

:: 配置
set "SSH_KEY=C:/Users/a8466/.ssh/id_rsa_nas"
set "SSH_USER=syadmin"
set "SSH_HOST=192.168.0.200"
set "NAS_TEST=/volume1/docker/huakey-crm-deploy/test"
set "LOCAL_ROOT=C:/huakey-crm"
set "SUDO_PASS=Aa123456"
set "DOCKER=/usr/local/bin/docker"

:: 检查SSH密钥
if not exist "%SSH_KEY%" (
    echo [错误] SSH密钥不存在: %SSH_KEY%
    pause
    exit /b 1
)

:: 检查SSH连接
echo [1/6] 测试SSH连接...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no -o ConnectTimeout=5 %SSH_USER%@%SSH_HOST% "echo ok" >nul 2>&1
if errorlevel 1 (
    echo [错误] SSH连接失败，请检查NAS是否在线
    pause
    exit /b 1
)
echo       SSH连接正常

:: 停止容器（避免同步时重启循环）
echo.
echo [1.5/6] 停止测试容器...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "echo %SUDO_PASS% | sudo -S %DOCKER% stop crm-test-app" >nul 2>&1
echo       容器已停止

:: 同步后端代码
echo.
echo [2/6] 同步后端代码...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "mkdir -p %NAS_TEST%/backend"
tar -C "%LOCAL_ROOT%" -cf - --exclude='node_modules' --exclude='.git' --exclude='logs' --exclude='backups' --exclude='uploads' backend > "%TEMP%\crm_sync.tar"
if errorlevel 1 (
    echo [错误] 后端打包失败
    del "%TEMP%\crm_sync.tar" >nul 2>&1
    pause
    exit /b 1
)
scp -i %SSH_KEY% -o StrictHostKeyChecking=no "%TEMP%\crm_sync.tar" %SSH_USER%@%SSH_HOST%:/tmp/crm_sync.tar
if errorlevel 1 (
    echo [错误] 后端传输失败
    del "%TEMP%\crm_sync.tar" >nul 2>&1
    pause
    exit /b 1
)
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "tar -xf /tmp/crm_sync.tar -C %NAS_TEST% && rm -f /tmp/crm_sync.tar"
if errorlevel 1 (
    echo [错误] 后端解压失败
    del "%TEMP%\crm_sync.tar" >nul 2>&1
    pause
    exit /b 1
)
del "%TEMP%\crm_sync.tar" >nul 2>&1
echo       后端同步完成

:: 安装后端依赖（在临时容器中运行，避免NAS主机PATH问题）
echo.
echo [2.5/6] 安装后端依赖...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "echo %SUDO_PASS% | sudo -S /usr/local/bin/docker run --rm -v %NAS_TEST%/backend:/app -w /app node:22-alpine npm install --production 2>&1 | tail -3"
if errorlevel 1 (
    echo [警告] 依赖安装可能有问题，请检查
)
echo       依赖安装完成

:: 构建前端
echo.
echo [3/6] 构建前端...
cd /d "%LOCAL_ROOT%\frontend"
call npm run build
set "BUILD_ERR=%errorlevel%"
cd /d "%LOCAL_ROOT%"
if not "%BUILD_ERR%"=="0" (
    echo [错误] 前端构建失败
    pause
    exit /b 1
)
echo       前端构建完成

:: 同步前端产物
echo.
echo [4/6] 同步前端产物...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "mkdir -p %NAS_TEST%/frontend/dist"
scp -i %SSH_KEY% -o StrictHostKeyChecking=no -r "%LOCAL_ROOT%\frontend\dist\*" %SSH_USER%@%SSH_HOST%:%NAS_TEST%/frontend/dist/
if errorlevel 1 (
    echo [错误] 前端同步失败
    pause
    exit /b 1
)
echo       前端同步完成

:: 同步数据库迁移
echo.
echo [5/6] 同步数据库迁移文件...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "mkdir -p %NAS_TEST%/database/migrations"
scp -i %SSH_KEY% -o StrictHostKeyChecking=no -r "%LOCAL_ROOT%\database\migrations\*" %SSH_USER%@%SSH_HOST%:%NAS_TEST%/database/migrations/
if errorlevel 1 (
    echo [错误] 迁移文件同步失败
    pause
    exit /b 1
)
echo       迁移文件同步完成

:: 重启容器并验证
echo.
echo [6/6] 重启测试容器...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "echo %SUDO_PASS% | sudo -S %DOCKER% restart crm-test-app" >nul 2>&1
if errorlevel 1 (
    echo [错误] 容器重启失败
    pause
    exit /b 1
)
echo       容器重启完成，等待服务启动...
timeout /t 5 /nobreak >nul

:: 健康检查
echo.
echo [验证] 检查服务状态...
curl -s --connect-timeout 10 http://%SSH_HOST%:6790/api/health >nul 2>&1
if errorlevel 1 (
    echo [警告] 健康检查未通过，服务可能还在启动中
    echo        请稍后手动访问: http://%SSH_HOST%:6790
) else (
    echo [成功] 测试环境部署完成！
    echo        访问地址: http://%SSH_HOST%:6790
)

echo.
pause
