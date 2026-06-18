@echo off
set SSH_KEY=C:\Users\a8466\.ssh\id_rsa_nas
set NAS=syadmin@192.168.0.200
set TEST=/volume1/docker/huakey-crm-deploy/test
set PROD=/volume1/docker/huakey-crm-deploy/prod

echo ========================================
echo  Huakey CRM Deploy: Test -^> Prod
echo ========================================
echo.
echo WARNING: Confirm test env is verified!
echo          http://192.168.0.200:6790
echo.
echo Press any key to continue, Ctrl+C to cancel...
pause >nul

echo.
echo [1/2] Copying code to prod...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "cp -r %TEST%/backend/* %PROD%/backend/ && cp -r %TEST%/frontend/dist/* %PROD%/frontend/dist/ && cp -r %TEST%/database/migrations/* %PROD%/database/migrations/"
if errorlevel 1 (
    echo ERROR: copy failed
    pause
    exit /b 1
)
echo Done.

echo.
echo [2/2] Installing dependencies...
ssh -i "%SSH_KEY%" -o StrictHostKeyChecking=no %NAS% "sudo /usr/local/bin/docker run --rm -v %PROD%/backend:/app -w /app node:22-alpine npm install --production 2>&1"
echo Done (ignore sudo errors above).

echo.
echo ========================================
echo  Code pushed to prod!
echo  Restart crm-prod-app in Container Manager
echo  Visit: http://192.168.0.200:6789
echo ========================================
pause
