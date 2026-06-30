@echo off
title Huakey CRM - Full Deploy

echo ============================================
echo  Huakey CRM Deploy: Local -^> Test -^> Prod
echo ============================================
echo.

echo [Phase 1] Syncing to test environment...
call "%~dp0sync-test.bat"
if errorlevel 1 (
    echo [ERROR] Test environment deploy failed
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Please verify test env: http://192.168.0.200:6790
echo  Press any key to push to production...
echo ============================================
pause >nul

echo.
echo [Phase 2] Pushing to production...
call "%~dp0push-prod.bat"

echo.
echo [Phase 3] Running smoke tests...
bash "%~dp0smoke-test.sh" http://192.168.0.200:6789
if errorlevel 1 (
    echo [ERROR] Smoke test failed! Manual rollback may be needed.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  Full deploy complete!
echo  Test: http://192.168.0.200:6790
echo  Prod: http://192.168.0.200:6789
echo ============================================
pause
