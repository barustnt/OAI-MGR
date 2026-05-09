#!/bin/bash
# OAI Manager — stop.sh
GREEN='\033[0;32m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
OAI_MGR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$OAI_MGR_DIR/.env" 2>/dev/null || true

echo -e "${RED}Stopping OAI Manager...${NC}"

stop_pid() {
  local name=$1 pidfile="$OAI_MGR_DIR/logs/$2.pid"
  if [[ -f "$pidfile" ]]; then
    PID=$(cat "$pidfile")
    kill "$PID" 2>/dev/null && echo -e "  ${GREEN}✓${NC} $name stopped"
    rm -f "$pidfile"
  fi
}

stop_pid "xApp server"  "xapp"
stop_pid "Frontend"     "frontend"
stop_pid "Backend"      "backend"
stop_pid "nearRT-RIC"   "ric"
pkill -x nearRT-RIC 2>/dev/null || true

sudo /usr/local/bin/kill_oai nr-softmodem 2>/dev/null || true
sudo /usr/local/bin/kill_oai nr-uesoftmodem 2>/dev/null || true

fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 7000/tcp 2>/dev/null || true

# Stop core
if [[ -n "${CORE_DIR:-}" ]]; then
  echo -e "  Stopping 5G Core..."
  cd "$CORE_DIR/docker-compose" 2>/dev/null && \
    docker compose -f docker-compose-basic-nrf.yaml down 2>&1 | tail -3 || true
fi

echo -e "${GREEN}All stopped.${NC}"
