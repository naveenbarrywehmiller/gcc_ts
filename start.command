#!/bin/bash

# ── TimeSheet Launcher (macOS) ──────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "==================================================="
echo "            TimeSheet Application Launcher"
echo "==================================================="
echo ""

# ── Check for Node.js ──────────────────────────────────────────
if ! command -v node &> /dev/null; then
    echo "[ERROR] Node.js is not installed or not in your PATH."
    echo "Please install Node.js from https://nodejs.org/ and try again."
    read -p "Press Enter to exit..."
    exit 1
fi

# ── Step 0: Kill previous instances ────────────────────────────
echo "[0/4] Cleaning up previous sessions..."
PORT_3001_PIDS=$(lsof -ti :3001 2>/dev/null)
PORT_5173_PIDS=$(lsof -ti :5173 2>/dev/null)

if [ -n "$PORT_3001_PIDS" ]; then
    echo "  -> Stopping old backend processes on port 3001..."
    kill -9 $PORT_3001_PIDS 2>/dev/null
fi

if [ -n "$PORT_5173_PIDS" ]; then
    echo "  -> Stopping old frontend processes on port 5173..."
    kill -9 $PORT_5173_PIDS 2>/dev/null
fi

sleep 1
echo "  -> Ports cleared."
echo ""

# ── Step 1: Install dependencies (cascades to server + client) ─
echo "[1/3] Installing dependencies..."
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "  -> First time setup: Installing all dependencies..."
    npm install
else
    echo "  -> All dependencies already installed."
fi

# ── Step 2: Start Backend ──────────────────────────────────────
echo "[2/3] Starting Backend Server..."
echo "  -> Backend on port 3001..."
osascript -e 'tell app "Terminal"
    do script "cd \"'"$SCRIPT_DIR/server"'\" && echo \"Starting backend...\" && npm run dev"
    set custom title of front window to "TimeSheet - Backend"
end tell'

echo ""

# ── Step 3: Start Frontend ─────────────────────────────────────
echo "[3/3] Starting Frontend Server..."
echo "  -> Frontend on port 5173..."
osascript -e 'tell app "Terminal"
    do script "cd \"'"$SCRIPT_DIR/client"'\" && echo \"Starting frontend...\" && npm run dev"
    set custom title of front window to "TimeSheet - Frontend"
end tell'

echo ""

# ── Step 4: Detect local IP & open browser ─────────────────────
echo "Waiting for servers to start..."
sleep 5

# Get local IPv4 address
LOCAL_IP=$(ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)

echo "Opening web browser to http://localhost:5173 ..."
open "http://localhost:5173"

echo ""
echo "==================================================="
echo "  Success! TimeSheet application is now running."
echo ""
echo "  Local:     http://localhost:5173"
if [ -n "$LOCAL_IP" ]; then
    echo "  Network:   http://$LOCAL_IP:5173"
fi
echo ""
echo "  * Two Terminal windows have been opened for the"
echo "    backend and frontend servers."
echo "  * Keep those windows open while using the app."
echo "  * Close them when you are done to stop the server."
if [ -n "$LOCAL_IP" ]; then
    echo ""
    echo "  TIP: Share the Network URL with other devices"
    echo "       on the same Wi-Fi/LAN to test remotely."
fi
echo "==================================================="
echo ""
read -p "Press Enter to exit..."
