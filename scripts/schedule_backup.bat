@echo off
chcp 65001 > nul
echo ==========================================
echo   Windows任务计划程序配置
echo   华科CRM数据库每日自动备份
echo ==========================================
echo.

set TASK_NAME=CRM_Database_Backup
set SCRIPT_PATH=%~dp0backup_database.bat

echo 正在创建Windows任务计划...
echo.

schtasks /create /tn "%TASK_NAME%" /tr "\"%SCRIPT_PATH%\"" /sc daily /st 02:00 /f

if %errorlevel% equ 0 (
    echo.
    echo 任务创建成功！
    echo.
    echo 任务名称: %TASK_NAME%
    echo 执行时间: 每天凌晨 02:00
    echo 执行脚本: %SCRIPT_PATH%
    echo.
    echo 如需立即执行备份，请运行:
    echo   schtasks /run /tn "%TASK_NAME%"
    echo.
    echo 如需删除此任务，请运行:
    echo   schtasks /delete /tn "%TASK_NAME%" /f
    echo.
) else (
    echo.
    echo 任务创建失败！请确保以管理员权限运行此脚本。
    echo.
)

echo ==========================================
pause