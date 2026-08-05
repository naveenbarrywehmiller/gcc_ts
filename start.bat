@echo off
title TimeSheet Launcher
color 0B

echo ===================================================
echo             TimeSheet Application Launcher
echo ===================================================
echo.

:: Check for Node.js
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed or not in your PATH.
    echo Please install Node.js from https://nodejs.org/ and try again.
    pause
    exit /b
)

:: Step 0: Kill any previous instances
echo [0/4] Cleaning up previous sessions...

:: Kill process holding port 3001 (backend) using PowerShell
echo   -^> Releasing port 3001...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Write-Host '    Killing PID' $_; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

:: Kill process holding port 5173 (frontend) using PowerShell
echo   -^> Releasing port 5173...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Write-Host '    Killing PID' $_; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

:: Fallback: kill lingering server windows by title
taskkill /F /FI "WINDOWTITLE eq TimeSheet - Backend" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq TimeSheet - Frontend" >nul 2>nul

:: Wait for ports to fully release
ping -n 4 127.0.0.1 >nul
echo   -^> Ports cleared.

echo.
:: Step 1: Install dependencies (cascades to server + client)
echo [1/3] Installing dependencies...
if not exist "node_modules\" (
    echo   -^> First time setup: Installing all dependencies...
    call npm install
) else if not exist "server\node_modules\" (
    call npm install
) else if not exist "client\node_modules\" (
    call npm install
) else (
    echo   -^> All dependencies already installed.
)

echo.
:: Step 2: Start Backend
echo [2/3] Starting Backend Server...
echo   -^> Backend on port 3001...
start "TimeSheet - Backend" cmd /c "title TimeSheet - Backend && echo Starting backend... && npm run dev:server"

echo.
:: Step 3: Start Frontend
echo [3/3] Starting Frontend Server...
echo   -^> Frontend on port 5173...
start "TimeSheet - Frontend" cmd /c "title TimeSheet - Frontend && echo Starting frontend... && npm run dev:client"

echo.
:: Step 4: Detect Local IP and Launch
echo Waiting for servers to start...
ping -n 6 127.0.0.1 >nul

:: Get local IPv4 address
set LOCAL_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        if not defined LOCAL_IP set LOCAL_IP=%%b
    )
)

echo Opening web browser to http://localhost:5173 ...
start http://localhost:5173

echo.
echo ===================================================
echo   Success! TimeSheet application is now running.
echo.
echo   Local:     http://localhost:5173
if defined LOCAL_IP (
echo   Network:   http://%LOCAL_IP%:5173
)
echo.
echo   * Two terminal windows have been opened for the 
echo     backend and frontend servers.
echo   * Keep those windows open while using the app.
echo   * Close them when you are done to stop the server.
echo.
if defined LOCAL_IP (
echo   TIP: Share the Network URL with other devices
echo        on the same Wi-Fi/LAN to test remotely.
)
echo ===================================================
echo.
pause

