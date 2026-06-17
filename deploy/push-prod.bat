@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo  铧旗CRM 部署脚本: 测试环境 → 生产环境
echo ============================================
echo.

:: 确认已通过测试
echo [确认] 请确保已在测试环境验证通过！
echo        测试地址: http://192.168.0.200:6790
echo.
echo 按任意键继续推送到生产环境，Ctrl+C 取消...
pause >nul

:: 配置
set "SSH_KEY=C:/Users/a8466/.ssh/id_rsa_nas"
set "SSH_USER=syadmin"
set "SSH_HOST=192.168.0.200"
set "NAS_TEST=/volume1/docker/huakey-crm-deploy/test"
set "NAS_PROD=/volume1/docker/huakey-crm-deploy/prod"
set "SUDO_PASS=Aa123456"
set "DOCKER=/usr/local/bin/docker"

:: 检查SSH连接
echo.
echo [1/4] 测试SSH连接...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no -o ConnectTimeout=5 %SSH_USER%@%SSH_HOST% "echo ok" >nul 2>&1
if errorlevel 1 (
    echo [错误] SSH连接失败
    pause
    exit /b 1
)
echo       SSH连接正常

:: 停止生产容器（避免复制时重启循环）
echo.
echo [1.5/4] 停止生产容器...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "echo %SUDO_PASS% | sudo -S %DOCKER% stop crm-prod-app" >nul 2>&1
echo       容器已停止

:: 复制后端
echo.
echo [2/4] 复制后端代码到生产环境...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "cp -r %NAS_TEST%/backend/* %NAS_PROD%/backend/"
if errorlevel 1 (
    echo [错误] 后端复制失败
    pause
    exit /b 1
)
echo       后端复制完成

:: 安装后端依赖（在临时容器中运行，避免NAS主机PATH问题）
echo.
echo [2.5/4] 安装后端依赖...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "echo %SUDO_PASS% | sudo -S /usr/local/bin/docker run --rm -v %NAS_PROD%/backend:/app -w /app node:22-alpine npm install --production 2>&1 | tail -3"
if errorlevel 1 (
    echo [警告] 依赖安装可能有问题，请检查
)
echo       依赖安装完成

:: 复制前端
echo.
echo [3/4] 复制前端产物到生产环境...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "mkdir -p %NAS_PROD%/frontend/dist && cp -r %NAS_TEST%/frontend/dist/* %NAS_PROD%/frontend/dist/"
if errorlevel 1 (
    echo [错误] 前端复制失败
    pause
    exit /b 1
)
echo       前端复制完成

:: 复制迁移文件
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "mkdir -p %NAS_PROD%/database/migrations && cp -r %NAS_TEST%/database/migrations/* %NAS_PROD%/database/migrations/" >nul 2>&1
echo       迁移文件复制完成

:: 重启生产容器
echo.
echo [4/4] 重启生产容器...
ssh -i %SSH_KEY% -o StrictHostKeyChecking=no %SSH_USER%@%SSH_HOST% "echo %SUDO_PASS% | sudo -S %DOCKER% restart crm-prod-app" >nul 2>&1
if errorlevel 1 (
    echo [错误] 生产容器重启失败
    pause
    exit /b 1
)
echo       容器重启完成，等待服务启动...
timeout /t 5 /nobreak >nul

:: 健康检查
echo.
echo [验证] 检查生产环境状态...
curl -s --connect-timeout 10 http://%SSH_HOST%:6789/api/health >nul 2>&1
if errorlevel 1 (
    echo [警告] 健康检查未通过，服务可能还在启动中
    echo        请稍后手动访问: http://%SSH_HOST%:6789
) else (
    echo [成功] 生产环境部署完成！
    echo        访问地址: http://%SSH_HOST%:6789
)

echo.
pause
