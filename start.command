#!/bin/bash

# ── Set terminal title ──────────────────────────────────────────
printf '\e]2;TimeSheet Launcher\a'

# ── Resolve directory where start.command lives ─────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Ensure Node.js & Homebrew are in PATH (needed for Finder click) ──
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls "$HOME/.nvm/versions/node" 2>/dev/null | tail -n 1)/bin:$PATH"

# Source shell profile if present
[ -f "$HOME/.zprofile" ] && source "$HOME/.zprofile" 2>/dev/null
[ -f "$HOME/.zshrc" ] && source "$HOME/.zshrc" 2>/dev/null

echo "==================================================="
echo "            TimeSheet Application Launcher"
echo "==================================================="
echo ""

# ── Check for Node.js ──────────────────────────────────────────
if ! command -v node >/dev/null 2>&1; then
    echo "[ERROR] Node.js is not installed or not in your PATH."
    echo "Please install Node.js from https://nodejs.org/ or run 'brew install node'"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# ── Step 0: Kill previous instances ────────────────────────────
echo "[0/4] Cleaning up previous sessions..."
PORT_3001_PIDS=$(lsof -ti :3001 2>/dev/null)
PORT_5173_PIDS=$(lsof -ti :5173 2>/dev/null)

if [ -n "$PORT_3001_PIDS" ]; then
    echo "  -> Releasing port 3001..."
    kill -9 $PORT_3001_PIDS 2>/dev/null
fi

if [ -n "$PORT_5173_PIDS" ]; then
    echo "  -> Releasing port 5173..."
    kill -9 $PORT_5173_PIDS 2>/dev/null
fi

sleep 1
echo "  -> Ports cleared."
echo ""

# ── Step 1: Install dependencies (cascades to server + client) ─
echo "[1/4] Installing dependencies..."
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "  -> First time setup: Installing all dependencies..."
    npm install
else
    echo "  -> All dependencies already installed."
fi

echo ""

# ── Step 2: Database setup (migrate + seed if DB does not exist) 
echo "[2/4] Checking database..."
if [ ! -f "server/data/timesheet.db" ]; then
    echo "  -> No database found. Running first-time setup (migrate + seed)..."
    npm run setup
    if [ $? -ne 0 ]; then
        echo "[ERROR] Database setup failed. Check server configuration and try again."
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo "  -> Database ready."
else
    echo "  -> Database already exists, running migrations to apply any updates..."
    (cd server && npm run migrate >/dev/null 2>&1)
    echo "  -> Migrations complete."
fi

echo ""

# ── Step 3: Start Backend Server ───────────────────────────────
echo "[3/4] Starting Backend Server..."
echo "  -> Backend on port 3001..."
osascript <<EOF >/dev/null 2>&1
tell application "Terminal"
    set newTab to do script "printf '\\\e]2;TimeSheet - Backend\\\a'; export PATH=\"$PATH\"; cd \"$SCRIPT_DIR\" && npm run dev:server"
    try
        set custom title of newTab to "TimeSheet - Backend"
    end try
end tell
EOF

echo "  -> Waiting for backend to initialise..."
sleep 3
echo ""

# ── Step 4: Start Frontend Server ──────────────────────────────
echo "[4/4] Starting Frontend Server..."
echo "  -> Frontend on port 5173..."
osascript <<EOF >/dev/null 2>&1
tell application "Terminal"
    set newTab to do script "printf '\\\e]2;TimeSheet - Frontend\\\a'; export PATH=\"$PATH\"; cd \"$SCRIPT_DIR\" && npm run dev:client"
    try
        set custom title of newTab to "TimeSheet - Frontend"
    end try
end tell
EOF

echo "  -> Waiting for frontend to be ready..."
sleep 4

# ── Detect local IP & open browser ─────────────────────────────
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | grep -Eo 'inet (addr:)?([0-9]*\.){3}[0-9]*' | grep -Eo '([0-9]*\.){3}[0-9]*' | grep -v '127.0.0.1' | head -1)

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
echo "  Two terminal windows are open:"
echo "    * TimeSheet - Backend  (port 3001)"
echo "    * TimeSheet - Frontend (port 5173)"
echo ""
echo "  Keep those windows open while using the app."
echo "  Close them (or press Ctrl+C inside) to stop."
if [ -n "$LOCAL_IP" ]; then
    echo ""
    echo "  TIP: Share the Network URL with other devices"
    echo "       on the same Wi-Fi/LAN to access remotely."
fi
echo "==================================================="
echo ""
read -p "Press Enter to exit launcher..."
