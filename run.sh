#!/bin/bash
# ============================================================
#  OAI Manager — run.sh
#  Starts the complete 5G stack in correct order:
#  1. 5G Core (Docker Compose)
#  2. nearRT-RIC (FlexRIC) — auto-starts with Core
#  3. OAI Manager backend + frontend
#  4. xApp server
# ============================================================

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'
YELLOW='\033[1;33m'; NC='\033[0m'

OAI_MGR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load .env
if [[ ! -f "$OAI_MGR_DIR/.env" ]]; then
  echo -e "${RED}ERROR: .env not found. Run install.sh first.${NC}"
  exit 1
fi
source "$OAI_MGR_DIR/.env"

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*"; }
die()  { echo -e "${RED}  ✗ ERROR: $*${NC}"; exit 1; }

echo -e "${CYAN}"
cat << 'BANNER'
  ╔═══════════════════════════════════╗
  ║      OAI Manager — Starting       ║
  ╚═══════════════════════════════════╝
BANNER
echo -e "${NC}"

# ── Validate required vars ─────────────────────────────────────
[[ -n "${CORE_DIR:-}" ]]       || die "CORE_DIR not set in .env"
[[ -n "${FLEXRIC_BUILD:-}" ]]  || die "FLEXRIC_BUILD not set in .env"
[[ -n "${XAPP_BIN:-}" ]]       || die "XAPP_BIN not set in .env"

# ── Cleanup ports ──────────────────────────────────────────────
log "Clearing ports..."
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
fuser -k 7000/tcp 2>/dev/null || true
docker stop ground-station 2>/dev/null || true
sleep 1

# ════════════════════════════════════════════════════════════
# 1. 5G Core
# ════════════════════════════════════════════════════════════
log "[1/4] Starting 5G Core Network..."

# Auto-detect compose file
COMPOSE_FILE=""
for f in \
  "$CORE_DIR/docker-compose-basic-nrf.yaml" \
  "$CORE_DIR/docker-compose/docker-compose-basic-nrf.yaml" \
  "$CORE_DIR/docker-compose.yaml"; do
  [[ -f "$f" ]] && COMPOSE_FILE="$f" && break
done
[[ -n "$COMPOSE_FILE" ]] || die "No compose file found in $CORE_DIR"

COMPOSE_DIR="$(dirname "$COMPOSE_FILE")"
COMPOSE_NAME="$(basename "$COMPOSE_FILE")"
log "Compose: $COMPOSE_FILE"

cd "$COMPOSE_DIR"
docker compose -f "$COMPOSE_NAME" up -d 2>&1 | tail -5

log "Waiting for core to be healthy (up to 60s)..."
for i in $(seq 1 30); do
  HEALTHY=$(docker compose -f "$COMPOSE_NAME" ps 2>/dev/null | grep -c "healthy" || echo 0)
  [[ "$HEALTHY" -ge 8 ]] && break
  printf "  [%d/30] healthy containers: %d\r" "$i" "$HEALTHY"
  sleep 2
done
echo ""
ok "5G Core running"

# ════════════════════════════════════════════════════════════
# 2. nearRT-RIC (auto with core)
# ════════════════════════════════════════════════════════════
log "[2/4] Starting nearRT-RIC..."
RIC_BIN="$FLEXRIC_BUILD/examples/ric/nearRT-RIC"
[[ -f "$RIC_BIN" ]] || die "nearRT-RIC binary not found at $RIC_BIN"

pkill -x nearRT-RIC 2>/dev/null || true
sleep 1

mkdir -p "$OAI_MGR_DIR/logs"
nohup "$RIC_BIN" > "$OAI_MGR_DIR/logs/ric.log" 2>&1 &
RIC_PID=$!
echo "$RIC_PID" > "$OAI_MGR_DIR/logs/ric.pid"
sleep 2

kill -0 "$RIC_PID" 2>/dev/null && ok "nearRT-RIC started (PID $RIC_PID)" || \
  die "nearRT-RIC failed — check logs/ric.log"

# ════════════════════════════════════════════════════════════
# 3. Backend + Frontend
# ════════════════════════════════════════════════════════════
log "[3/4] Starting OAI Manager backend..."

# Activate conda — don't use set -e here, conda can return non-zero
CONDA_BASE=$(conda info --base 2>/dev/null || echo "$HOME/miniconda3")
source "$CONDA_BASE/etc/profile.d/conda.sh" 2>/dev/null || true
conda activate oai-manager 2>/dev/null || \
  warn "Could not activate oai-manager conda env — using system Python"

cd "$OAI_MGR_DIR/backend"
nohup uvicorn main:app --host 0.0.0.0 --port 8000 \
  > "$OAI_MGR_DIR/logs/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$OAI_MGR_DIR/logs/backend.pid"

# Wait up to 15s for backend
BACKEND_OK=false
for i in $(seq 1 15); do
  curl -s http://localhost:8000/ > /dev/null 2>&1 && BACKEND_OK=true && break
  sleep 1
done
$BACKEND_OK && ok "Backend running (PID $BACKEND_PID)" || \
  warn "Backend slow to start — check logs/backend.log"

log "Starting frontend..."
cd "$OAI_MGR_DIR/frontend"
nohup npm run dev > "$OAI_MGR_DIR/logs/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$OAI_MGR_DIR/logs/frontend.pid"
sleep 3
ok "Frontend running (PID $FRONTEND_PID)"

# ════════════════════════════════════════════════════════════
# 4. xApp server
# ════════════════════════════════════════════════════════════
log "[4/4] Starting xApp server..."
cd "$OAI_MGR_DIR/xapp"
nohup python3 xapp_server.py > "$OAI_MGR_DIR/logs/xapp.log" 2>&1 &
XAPP_PID=$!
echo "$XAPP_PID" > "$OAI_MGR_DIR/logs/xapp.pid"
sleep 2

kill -0 "$XAPP_PID" 2>/dev/null && ok "xApp server running (PID $XAPP_PID)" || \
  warn "xApp server failed — check logs/xapp.log"

# ── Summary ───────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════════╗"
echo -e "║       OAI Manager is running! ✓             ║"
echo -e "╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}Dashboard${NC}  →  http://localhost:3000"
echo -e "  ${CYAN}API Docs${NC}   →  http://localhost:8000/docs"
echo -e "  ${CYAN}xApp API${NC}   →  http://localhost:7000/docs"
echo ""
echo -e "${YELLOW}Next steps in the browser:${NC}"
echo -e "  1. gNB page  → RFSIM → Start gNB"
echo -e "  2. UE page   → Start UE"
echo -e "  3. Metrics   → Discover UE IP → Run iperf"
echo -e "  4. xApp page → Apply eMBB / URLLC / mMTC"
echo ""
echo -e "  Logs: ${CYAN}tail -f $OAI_MGR_DIR/logs/*.log${NC}"
echo -e "  Stop: ${CYAN}bash stop.sh${NC}"
echo ""

xdg-open http://localhost:3000 2>/dev/null || true

# Keep alive + show status every 30s
log "Running... Press Ctrl+C to stop everything"
trap 'echo ""; bash "$OAI_MGR_DIR/stop.sh"; exit 0' SIGINT SIGTERM

while true; do
  sleep 30
  HEALTHY=$(docker compose -f "$COMPOSE_FILE" ps 2>/dev/null | grep -c "healthy" || echo 0)
  RIC_UP=$(kill -0 "$RIC_PID" 2>/dev/null && echo "✓" || echo "✗")
  BACK_UP=$(kill -0 "$BACKEND_PID" 2>/dev/null && echo "✓" || echo "✗")
  XAPP_UP=$(kill -0 "$XAPP_PID" 2>/dev/null && echo "✓" || echo "✗")
  echo -e "${CYAN}[status]${NC} Core:${HEALTHY}/10  RIC:${RIC_UP}  Backend:${BACK_UP}  xApp:${XAPP_UP}"
done
