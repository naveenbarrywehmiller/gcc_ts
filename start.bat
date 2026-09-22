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
echo   -> Releasing port 3001...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Write-Host '    Killing PID' $_; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

:: Kill process holding port 5173 (frontend) using PowerShell
echo   -> Releasing port 5173...
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique | ForEach-Object { Write-Host '    Killing PID' $_; Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }"

:: Fallback: kill lingering server windows by title
taskkill /F /FI "WINDOWTITLE eq TimeSheet - Backend" >nul 2>nul
taskkill /F /FI "WINDOWTITLE eq TimeSheet - Frontend" >nul 2>nul

:: Wait for ports to fully release
ping -n 4 127.0.0.1 >nul
echo   -> Ports cleared.

echo.
:: Step 1: Install dependencies (cascades to server + client)
echo [1/4] Installing dependencies...
if not exist "node_modules\" (
    echo   -> First time setup: Installing all dependencies...
    call npm install
) else if not exist "server\node_modules\" (
    echo   -> Server dependencies missing, installing...
    call npm install
) else if not exist "client\node_modules\" (
    echo   -> Client dependencies missing, installing...
    call npm install
) else (
    echo   -> All dependencies already installed.
)

echo.
:: Step 2: Database setup (migrate + seed if DB does not exist)
echo [2/4] Checking database...
if not exist "server\data\timesheet.db" (
    echo   -> No database found. Running first-time setup (migrate + seed^)...
    call npm run setup
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Database setup failed. Check server configuration and try again.
        pause
        exit /b
    )
    echo   -> Database ready.
) else (
    echo   -> Database already exists, running migrations to apply any updates...
    cd server
    call npm run migrate >nul 2>nul
    cd ..
    echo   -> Migrations complete.
)

echo.
:: Step 3: Start Backend in its own window (run from root so npm scripts resolve correctly)
echo [3/4] Starting Backend Server...
echo   -> Backend on port 3001...
start "TimeSheet - Backend" cmd /k "title TimeSheet - Backend && cd /d "%~dp0" && npm run dev:server"

:: Give the backend time to fully initialise before starting the frontend
echo   -> Waiting for backend to initialise...
ping -n 8 127.0.0.1 >nul

echo.
:: Step 4: Start Frontend in its own window
echo [4/4] Starting Frontend Server...
echo   -> Frontend on port 5173...
start "TimeSheet - Frontend" cmd /k "title TimeSheet - Frontend && cd /d "%~dp0" && npm run dev:client"

:: Wait for Vite to be ready before opening the browser
echo   -> Waiting for frontend to be ready...
ping -n 10 127.0.0.1 >nul

:: Get local IPv4 address (skip Tailscale / APIPA ranges)
set LOCAL_IP=
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4 Address"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        if not defined LOCAL_IP (
            echo %%b | findstr /v "169.254" >nul
            if not errorlevel 1 set LOCAL_IP=%%b
        )
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
echo   Two terminal windows are open:
echo     * TimeSheet - Backend  (port 3001)
echo     * TimeSheet - Frontend (port 5173)
echo.
echo   Keep those windows open while using the app.
echo   Close them (or press Ctrl+C inside) to stop.
echo.
if defined LOCAL_IP (
echo   TIP: Share the Network URL with other devices
echo        on the same Wi-Fi/LAN to access remotely.
)
echo ===================================================
echo.
pause
