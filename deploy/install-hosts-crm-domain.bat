@echo off
chcp 65001 > nul
:: ============================================================
:: HuakeyCRM 内网域名 hosts 配置脚本
:: 需要以管理员身份运行（右键 -> 以管理员身份运行）
:: ============================================================

:: 检查管理员权限
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo 错误：需要管理员权限运行此脚本
    echo 请右键点击此文件，选择"以管理员身份运行"
    pause
    exit /b 1
)

set HOSTS_FILE=C:\Windows\System32\drivers\etc\hosts
set DOMAIN=crm.huakey.local
set IP=192.168.0.200

echo ============================================
echo   HuakeyCRM 内网域名 hosts 配置
echo ============================================
echo.

:: 检查是否已存在
findstr /C:"%DOMAIN%" "%HOSTS_FILE%" >nul 2>&1
if %errorLevel% equ 0 (
    echo 域名 %DOMAIN% 已存在于 hosts 文件中，无需重复添加。
    findstr /C:"%DOMAIN%" "%HOSTS_FILE%"
    echo.
    echo 配置已完成，可直接在浏览器访问 https://%DOMAIN%
    pause
    exit /b 0
)

:: 追加 hosts 条目
echo. >> "%HOSTS_FILE%"
echo # HuakeyCRM 内网域名解析 >> "%HOSTS_FILE%"
echo %IP% %DOMAIN% >> "%HOSTS_FILE%"

if %errorLevel% equ 0 (
    echo 成功添加 hosts 条目：
    echo   %IP% %DOMAIN%
    echo.
    echo 配置完成！现在可以在浏览器访问：
    echo   https://%DOMAIN%
) else (
    echo 错误：写入 hosts 文件失败
)

echo.
pause
exit /b 0
