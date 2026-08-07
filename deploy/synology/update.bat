@echo off
chcp 65001 >nul
echo ============================================
echo 铧旗CRM - NAS 更新脚本
echo ============================================
echo.

REM 检查是否安装了 sshpass
where sshpass >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] 未安装 sshpass，请先安装：
    echo   Git Bash: pacman -S sshpass
    echo   或使用 MSYS2: pacman -S sshpass
    echo.
    pause
    exit /b 1
)

REM 执行更新脚本
bash "%~dp0update.sh"

echo.
pause
