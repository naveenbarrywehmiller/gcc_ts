#!/bin/bash
# ═══════════════════════════════════════════════════════════════════
#  TimeSheet Database Manager — interactive backup/restore/cron tool
#  Usage: ./db-manager.sh
# ═══════════════════════════════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SERVER_DIR="$SCRIPT_DIR/server"
BACKUP_DIR="$SERVER_DIR/backup"
DB_PATH="$SERVER_DIR/src/data/timesheet.db"

# ── Colors ───────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ── Helpers ──────────────────────────────────────────────────────
header() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}     ${BOLD}TimeSheet Database Manager${NC}                     ${CYAN}║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════╝${NC}"
  echo ""
}

menu() {
  echo -e "${BOLD}Choose an option:${NC}"
  echo ""
  echo "  ${BOLD}1${NC})  📦  Backup database now"
  echo "  ${BOLD}2${NC})  📋  List existing backups"
  echo "  ${BOLD}3${NC})  🔄  Restore from backup"
  echo "  ${BOLD}4${NC})  ⏰  Setup daily cron job"
  echo "  ${BOLD}5${NC})  📊  View cron job status"
  echo "  ${BOLD}6${NC})  🗑️   Remove cron job"
  echo "  ${BOLD}0${NC})  🚪  Exit"
  echo ""
}

# ── DB info ──────────────────────────────────────────────────────
db_info() {
  if [ -f "$DB_PATH" ]; then
    local size=$(du -h "$DB_PATH" | cut -f1)
    local date=$(date -r "$DB_PATH" "+%Y-%m-%d %H:%M" 2>/dev/null || stat -c "%y" "$DB_PATH" 2>/dev/null | cut -d'.' -f1)
    echo -e "  DB File:   ${GREEN}$DB_PATH${NC}"
    echo -e "  Size:      ${GREEN}$size${NC}"
    echo -e "  Modified:  ${GREEN}$date${NC}"
  else
    echo -e "  ${RED}⚠ Database not found at $DB_PATH${NC}"
  fi

  local count=0
  if [ -d "$BACKUP_DIR" ]; then
    count=$(ls -1 "$BACKUP_DIR"/*.db 2>/dev/null | wc -l | tr -d ' ')
  fi
  echo -e "  Backups:   ${GREEN}$count${NC} in $BACKUP_DIR"
  echo ""
}

# ── Check Node.js ────────────────────────────────────────────────
check_node() {
  if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js is required but not installed.${NC}"
    exit 1
  fi
}

# ── 1. Backup ────────────────────────────────────────────────────
do_backup() {
  echo -e "\n${YELLOW}📦 Running backup...${NC}"
  cd "$SERVER_DIR"
  npm run backup
  echo -e "${GREEN}✓ Backup complete.${NC}"
}

# ── 2. List backups ──────────────────────────────────────────────
list_backups() {
  echo ""
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/*.db 2>/dev/null)" ]; then
    echo -e "${YELLOW}  No backups found.${NC}"
    return
  fi

  echo -e "${BOLD}  Available backups:${NC}"
  echo ""
  local i=1
  for f in "$BACKUP_DIR"/*.db; do
    local size=$(du -h "$f" | cut -f1)
    local date=$(date -r "$f" "+%Y-%m-%d %H:%M" 2>/dev/null || stat -c "%y" "$f" 2>/dev/null | cut -d'.' -f1)
    echo -e "  ${BOLD}$i${NC}) $(basename "$f")  ${CYAN}${size}${NC}  ${date}"
    i=$((i + 1))
  done
  echo ""
}

# ── 3. Restore ───────────────────────────────────────────────────
do_restore() {
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A "$BACKUP_DIR"/*.db 2>/dev/null)" ]; then
    echo -e "${RED}✗ No backups available to restore.${NC}"
    return
  fi

  list_backups

  echo -ne "  Enter backup number to restore (or 0 to cancel): "
  read -r choice

  if [ "$choice" = "0" ] || [ -z "$choice" ]; then
    echo -e "${YELLOW}  Restore cancelled.${NC}"
    return
  fi

  local files=("$BACKUP_DIR"/*.db)
  local idx=$((choice - 1))
  if [ "$idx" -lt 0 ] || [ "$idx" -ge "${#files[@]}" ]; then
    echo -e "${RED}✗ Invalid selection.${NC}"
    return
  fi

  local file="${files[$idx]}"

  echo ""
  echo -e "${YELLOW}⚠ WARNING: This will replace the current database.${NC}"
  echo -e "  Restore from: ${BOLD}$(basename "$file")${NC}"
  echo -ne "  Type ${RED}YES${NC} to confirm: "
  read -r confirm

  if [ "$confirm" != "YES" ]; then
    echo -e "${YELLOW}  Restore cancelled.${NC}"
    return
  fi

  # Track whether server was running before restore
  local was_running=false
  local server_pid=$(lsof -ti :3001 2>/dev/null)
  if [ -n "$server_pid" ]; then
    was_running=true
    echo ""
    echo -e "  ${YELLOW}Server is running on port 3001.${NC}"
    echo -ne "  ${YELLOW}Stop it to proceed with restore? (y/n): ${NC}"
    read -r stop
    if [ "$stop" = "y" ] || [ "$stop" = "Y" ]; then
      kill -9 $server_pid 2>/dev/null
      echo -e "  ${GREEN}✓ Server stopped.${NC}"
    else
      echo -e "${RED}✗ Cannot restore while server is running.${NC}"
      return
    fi
  fi

  cd "$SERVER_DIR"
  npm run restore -- "$file"
  echo -e "${GREEN}✓ Database restored.${NC}"

  # Offer to restart
  echo ""
  if $was_running; then
    echo -ne "  ${YELLOW}Restart the server now? (y/n): ${NC}"
  else
    echo -ne "  ${YELLOW}Start the server now? (y/n): ${NC}"
  fi
  read -r start_choice
  if [ "$start_choice" = "y" ] || [ "$start_choice" = "Y" ]; then
    echo -e "  ${GREEN}Starting server...${NC}"
    osascript -e "tell app \"Terminal\" to do script \"cd '$SERVER_DIR' && npm run dev\"" 2>/dev/null || \
      (cd "$SERVER_DIR" && npm run dev &)
    echo -e "  ${GREEN}✓ Server started on http://localhost:3001${NC}"
  fi
}

# ── 4. Setup cron ────────────────────────────────────────────────
setup_cron() {
  echo ""
  echo -e "${BOLD}  Daily backup schedule:${NC}"
  echo ""
  echo "  1) 02:00 AM (recommended — low traffic)"
  echo "  2) 06:00 AM"
  echo "  3) 11:00 PM"
  echo "  4) Custom time"
  echo "  0) Cancel"
  echo ""

  echo -ne "  Choose: "
  read -r choice

  local hour="2"
  case "$choice" in
    1) hour="2";;
    2) hour="6";;
    3) hour="23";;
    4) echo -ne "  Enter hour (0-23): "; read -r hour;;
    0|"") echo -e "${YELLOW}  Cancelled.${NC}"; return;;
    *) echo -e "${RED}✗ Invalid choice.${NC}"; return;;
  esac

  # Build cron entry
  local cron_entry="$hour 2 * * * cd $SERVER_DIR && npm run backup >> $BACKUP_DIR/cron-backup.log 2>&1"
  local marker="# TIMESHEET_BACKUP_CRON"

  # Remove existing entry if any
  (crontab -l 2>/dev/null | grep -v "$marker"; echo "$marker"; echo "$cron_entry") | crontab -

  echo ""
  echo -e "${GREEN}✓ Daily backup scheduled at $(printf "%02d" $hour):02 AM${NC}"
  echo -e "  Logs: ${CYAN}$BACKUP_DIR/cron-backup.log${NC}"
}

# ── 5. View cron ─────────────────────────────────────────────────
view_cron() {
  echo ""
  local marker="# TIMESHEET_BACKUP_CRON"
  if crontab -l 2>/dev/null | grep -q "$marker"; then
    echo -e "${GREEN}✓ Cron job is active:${NC}"
    echo ""
    crontab -l | grep -A1 "$marker" | tail -1 | while read -r line; do
      echo -e "  ${CYAN}$line${NC}"
    done
    echo ""
    # Show recent log
    local log="$BACKUP_DIR/cron-backup.log"
    if [ -f "$log" ]; then
      echo -e "${BOLD}  Recent backup logs:${NC}"
      tail -5 "$log" | while read -r l; do echo "    $l"; done
    fi
  else
    echo -e "${YELLOW}  No cron job configured. Use option 4 to set one up.${NC}"
  fi
}

# ── 6. Remove cron ───────────────────────────────────────────────
remove_cron() {
  echo ""
  local marker="# TIMESHEET_BACKUP_CRON"
  if crontab -l 2>/dev/null | grep -q "$marker"; then
    echo -ne "  ${YELLOW}Remove the daily backup cron job? (y/n): ${NC}"
    read -r confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
      crontab -l 2>/dev/null | grep -v "$marker" | grep -v "npm run backup" | crontab - 2>/dev/null || crontab -r 2>/dev/null
      echo -e "${GREEN}✓ Cron job removed.${NC}"
    fi
  else
    echo -e "${YELLOW}  No cron job to remove.${NC}"
  fi
}

# ── Main ─────────────────────────────────────────────────────────
check_node

while true; do
  clear 2>/dev/null || true
  header
  db_info
  menu

  echo -ne "  Enter choice ${BOLD}[0-6]${NC}: "
  read -r choice
  echo ""

  case "$choice" in
    1) do_backup;;
    2) list_backups;;
    3) do_restore;;
    4) setup_cron;;
    5) view_cron;;
    6) remove_cron;;
    0) echo -e "${GREEN}👋 Goodbye!${NC}"; echo ""; exit 0;;
    *) echo -e "${RED}✗ Invalid option.${NC}";;
  esac

  echo ""
  echo -ne "  Press ${BOLD}Enter${NC} to continue..."
  read -r
done
