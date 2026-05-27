@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

echo ==========================================
echo   华科CRM数据库备份脚本
echo ==========================================
echo.

set BACKUP_DIR=%~dp0backups
set DB_NAME=huakey_crm
set DB_USER=root
set DB_PASSWORD=
set MYSQL_BIN=C:\Program Files\MySQL\MySQL Server 8.0\bin
set KEEP_DAYS=30

if exist "%MYSQL_BIN%\mysqldump.exe" (
    set MYSQLDUMP="%MYSQL_BIN%\mysqldump.exe"
    set MYSQL="%MYSQL_BIN%\mysql.exe"
) else (
    set MYSQLDUMP=mysqldump
    set MYSQL=mysql
)

if not exist "%BACKUP_DIR%" (
    mkdir "%BACKUP_DIR%"
    echo 创建备份目录: %BACKUP_DIR%
)

set DATETIME=%date:~0,4%%date:~5,2%%date:~8,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set DATETIME=%DATETIME: =0%
set BACKUP_FILE=%BACKUP_DIR%\%DB_NAME%_%DATETIME%.sql

echo 开始备份数据库: %DB_NAME%
echo 备份文件: %BACKUP_FILE%
echo.

if "%DB_PASSWORD%"=="" (
    set PASSWORD_PARAM=
) else (
    set PASSWORD_PARAM=-p%DB_PASSWORD%
)

echo正在执行备份，请稍候...
"%MYSQLDUMP%" -u%DB_USER% %PASSWORD_PARAM% --single-transaction --quick --lock-tables=false --routines --triggers --events %DB_NAME% > "%BACKUP_FILE%"

if %errorlevel% equ 0 (
    echo.
    echo 备份成功！
    for %%A in ("%BACKUP_FILE%") do echo 文件大小: %%~zA 字节
) else (
    echo.
    echo 备份失败！错误代码: %errorlevel%
    del "%BACKUP_FILE%" 2>nul
    exit /b 1
)

echo.
echo 正在清理 %KEEP_DAYS% 天前的备份文件...
forfiles /P "%BACKUP_DIR%" /S /M *.sql /D -%KEEP_DAYS% /C "cmd /c del @path" 2>nul

echo.
echo 备份完成！
echo ==========================================

exit /b 0