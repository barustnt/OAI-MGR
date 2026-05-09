#!/bin/bash
# ============================================================
#  OAI Manager — install.sh
#  One-time setup for the complete 5G stack.
#
#  Usage:  bash install.sh
#  Time:   ~45-90 min (first time), ~5 min (already installed)
#
#  Tested on Ubuntu 22.04 / 24.04 (x86_64)
# ============================================================

GREEN='\033[0;32m'; CYAN='\033[0;36m'; RED='\033[0;31m'
YELLOW='\033[1;33m'; NC='\033[0m'

OAI_MGR_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="$OAI_MGR_DIR/install.log"

log()  { echo -e "${CYAN}[$(date +%H:%M:%S)]${NC} $*" | tee -a "$LOG"; }
ok()   { echo -e "${GREEN}  ✓${NC} $*" | tee -a "$LOG"; }
warn() { echo -e "${YELLOW}  ⚠${NC} $*" | tee -a "$LOG"; }
die()  { echo -e "${RED}  ✗ ERROR: $*${NC}" | tee -a "$LOG"; exit 1; }

echo -e "${CYAN}"
cat << 'BANNER'
  ╔══════════════════════════════════════════╗
  ║         OAI Manager — Installer          ║
  ║   5G Core + gNB + FlexRIC + xApp + UI   ║
  ╚══════════════════════════════════════════╝
BANNER
echo -e "${NC}"

log "Install log: $LOG"

# ════════════════════════════════════════════════════════════
# STEP 1 — System packages
# ════════════════════════════════════════════════════════════
log "[1/8] Installing system packages..."
sudo apt-get update -qq 2>&1 | tail -2
sudo apt-get install -y \
  git curl wget ca-certificates unzip \
  build-essential cmake ninja-build pkg-config \
  gcc g++ make python3 python3-pip python3-venv \
  autoconf automake libtool bison flex swig \
  libsctp-dev lksctp-tools \
  libgmp-dev libmpfr-dev libmpc-dev \
  libxml2 libxml2-dev libconfig-dev \
  libfftw3-dev libmbedtls-dev \
  libboost-program-options-dev libboost-system-dev libboost-test-dev \
  libsqlite3-dev sqlite3 \
  iproute2 net-tools iperf3 tcpdump 2>&1 | tail -5
ok "System packages installed"

# ── Docker ────────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
  log "Installing Docker..."
  curl -fsSL https://get.docker.com | sudo bash
  sudo usermod -aG docker "$USER"
  ok "Docker installed (you may need to log out and back in)"
else
  ok "Docker: $(docker --version)"
fi

# ── Miniconda ─────────────────────────────────────────────────
CONDA_CMD=""
if command -v conda &>/dev/null; then
  CONDA_CMD="conda"
  ok "Conda already installed"
elif [[ -f "$HOME/miniconda3/bin/conda" ]]; then
  CONDA_CMD="$HOME/miniconda3/bin/conda"
  ok "Miniconda found at $HOME/miniconda3"
else
  log "Installing Miniconda..."
  wget -q https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh \
    -O /tmp/miniconda.sh
  bash /tmp/miniconda.sh -b -p "$HOME/miniconda3"
  CONDA_CMD="$HOME/miniconda3/bin/conda"
  # Add to bashrc if not already there
  grep -q "miniconda3/bin/conda" ~/.bashrc || \
    echo 'eval "$('"$HOME"'/miniconda3/bin/conda shell.bash hook)"' >> ~/.bashrc
  ok "Miniconda installed"
fi

# Source conda for this session
CONDA_BASE=$($CONDA_CMD info --base 2>/dev/null || echo "$HOME/miniconda3")
source "$CONDA_BASE/etc/profile.d/conda.sh" 2>/dev/null || true

# ── Node.js 18+ ───────────────────────────────────────────────
NODE_VER=$(node --version 2>/dev/null | sed 's/v//' | cut -d. -f1 || echo 0)
if [[ "$NODE_VER" -lt 18 ]]; then
  log "Upgrading Node.js to 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs 2>&1 | tail -3
fi
ok "Node.js $(node --version)"

# ════════════════════════════════════════════════════════════
# STEP 2 — OAI 5G Core (official wiki method)
# ════════════════════════════════════════════════════════════
log "[2/8] Setting up OAI 5G Core..."

CORE_DIR="$HOME/oai-cn5g"

if [[ -d "$CORE_DIR" ]]; then
  ok "OAI CN5G already exists at $CORE_DIR"
else
  log "Downloading OAI CN5G (official wiki method)..."
  wget -q -O /tmp/oai-cn5g.zip \
    "https://gitlab.eurecom.fr/oai/openairinterface5g/-/archive/develop/openairinterface5g-develop.zip?path=doc/tutorial_resources/oai-cn5g"
  unzip -q /tmp/oai-cn5g.zip -d /tmp/oai-cn5g-extract
  mv /tmp/oai-cn5g-extract/openairinterface5g-develop-doc-tutorial_resources-oai-cn5g/doc/tutorial_resources/oai-cn5g \
     "$CORE_DIR"
  rm -rf /tmp/oai-cn5g-extract /tmp/oai-cn5g.zip
  ok "OAI CN5G downloaded to $CORE_DIR"
fi

# Find compose file
COMPOSE_FILE=""
for f in \
  "$CORE_DIR/docker-compose-basic-nrf.yaml" \
  "$CORE_DIR/docker-compose/docker-compose-basic-nrf.yaml" \
  "$CORE_DIR/docker-compose.yaml"; do
  [[ -f "$f" ]] && COMPOSE_FILE="$f" && break
done

if [[ -n "$COMPOSE_FILE" ]]; then
  ok "Compose file: $COMPOSE_FILE"
  log "Pulling 5G Core Docker images (may take several minutes)..."
  cd "$(dirname "$COMPOSE_FILE")"
  docker compose -f "$(basename "$COMPOSE_FILE")" pull 2>&1 | \
    grep -E "Pulling|pulled|already" | tail -15 || true
  ok "Core Docker images ready"
else
  warn "Compose file not found — check $CORE_DIR manually"
  find "$CORE_DIR" -name "*.yaml" 2>/dev/null | head -10
fi

# ════════════════════════════════════════════════════════════
# STEP 3 — OAI RAN (gNB + UE)
# ════════════════════════════════════════════════════════════
log "[3/8] Setting up OAI RAN..."

# Check common install locations
RAN_DIR=""
for d in \
  "$HOME/openairinterface5g" \
  "$HOME/oai-stack/openairinterface5g"; do
  [[ -f "$d/cmake_targets/ran_build/build/nr-softmodem" ]] && \
    RAN_DIR="$d" && break
done

if [[ -n "$RAN_DIR" ]]; then
  ok "OAI RAN already built at $RAN_DIR"
else
  # Clone to ~/oai-stack/openairinterface5g
  RAN_DIR="$HOME/oai-stack/openairinterface5g"
  mkdir -p "$HOME/oai-stack"

  if [[ ! -d "$RAN_DIR" ]]; then
    log "Cloning OAI RAN (this takes ~5 min)..."
    git clone --depth 1 --branch develop \
      https://gitlab.eurecom.fr/oai/openairinterface5g.git "$RAN_DIR"
  fi

  log "Installing RAN build dependencies..."
  cd "$RAN_DIR/cmake_targets"
  ./build_oai -I 2>&1 | tail -5

  log "Building gNB + UE (this takes ~20-40 min)..."
  ./build_oai --gNB --nrUE -w SIMU 2>&1 | tail -10
  ok "gNB and UE built"
fi

# ════════════════════════════════════════════════════════════
# STEP 4 — FlexRIC (Near-RT RIC)
# ════════════════════════════════════════════════════════════
log "[4/8] Setting up FlexRIC..."

FLEXRIC_SRC="$RAN_DIR/openair2/E2AP/flexric"
FLEXRIC_BUILD="$FLEXRIC_SRC/build"
RIC_BIN="$FLEXRIC_BUILD/examples/ric/nearRT-RIC"

if [[ -f "$RIC_BIN" ]]; then
  ok "FlexRIC already built at $RIC_BIN"
else
  log "Building FlexRIC (requires OAI RAN to be cloned)..."
  [[ -d "$FLEXRIC_SRC" ]] || die "FlexRIC source not found at $FLEXRIC_SRC"
  cd "$FLEXRIC_SRC"
  mkdir -p build && cd build
  cmake .. \
    -DE2AP_VERSION=E2AP_V3 \
    -DKPM_VERSION=KPM_V3_00 \
    -DCMAKE_BUILD_TYPE=Release 2>&1 | tail -3
  make -j"$(nproc)" 2>&1 | tail -5
  sudo make install 2>&1 | tail -3
  ok "FlexRIC built and installed"
fi

# ════════════════════════════════════════════════════════════
# STEP 5 — xApp binary
# ════════════════════════════════════════════════════════════
log "[5/8] Building xApp binary..."

XAPP_BIN="$OAI_MGR_DIR/xapp/xapp_slice_ctrl"

if [[ -f "$XAPP_BIN" ]]; then
  ok "xApp binary already exists"
else
  [[ -f "$OAI_MGR_DIR/xapp/xapp_slice_ctrl.c" ]] || \
    die "xApp source not found: $OAI_MGR_DIR/xapp/xapp_slice_ctrl.c"

  # Copy source to flexric source tree (relative includes need this)
  cp "$OAI_MGR_DIR/xapp/xapp_slice_ctrl.c" \
     "$FLEXRIC_SRC/examples/xApp/c/slice/"

  cd "$FLEXRIC_BUILD"
  /usr/bin/cc \
    -DASN -DE2AP_V3 -DKPM_V3_00 \
    -DSERVICE_MODEL_DIR_PATH=\"/\" -DSQLITE3_XAPP \
    -I"$FLEXRIC_SRC/src" \
    -O3 -DNDEBUG -std=gnu11 -fPIE \
    -W -Wall -Wextra -g \
    -Wno-unused-result -Warray-bounds -Wempty-body \
    -fstack-protector-strong -fstack-clash-protection \
    "$FLEXRIC_SRC/examples/xApp/c/slice/xapp_slice_ctrl.c" \
    "$FLEXRIC_SRC/src/util/alg_ds/alg/defer.c" \
    "$FLEXRIC_SRC/src/util/time_now_us.c" \
    -L"$FLEXRIC_BUILD/src/xApp" -le42_xapp_shared \
    -L/usr/local/lib/flexric -lslice_sm -lsctp \
    -Wl,-rpath,"$FLEXRIC_BUILD/src/xApp" \
    -Wl,-rpath,/usr/local/lib/flexric \
    -o "$XAPP_BIN"
  ok "xApp binary built: $XAPP_BIN"
fi

# ════════════════════════════════════════════════════════════
# STEP 6 — kill_oai safety wrapper
# ════════════════════════════════════════════════════════════
log "[6/8] Installing kill_oai wrapper..."

sudo cp "$OAI_MGR_DIR/scripts/kill_oai" /usr/local/bin/kill_oai
sudo chmod +x /usr/local/bin/kill_oai

SUDOERS_LINE="$USER ALL=(ALL) NOPASSWD: /usr/local/bin/kill_oai"
if ! sudo grep -qF "kill_oai" /etc/sudoers 2>/dev/null; then
  echo "$SUDOERS_LINE" | sudo tee -a /etc/sudoers > /dev/null
  ok "kill_oai added to sudoers"
else
  ok "kill_oai already in sudoers"
fi

# ════════════════════════════════════════════════════════════
# STEP 7 — Python backend environment
# ════════════════════════════════════════════════════════════
log "[7/8] Setting up Python backend (conda env: oai-manager)..."

if ! conda env list | grep -q "^oai-manager "; then
  conda create -n oai-manager python=3.11 -y 2>&1 | tail -3
  ok "Conda env created"
else
  ok "Conda env oai-manager already exists"
fi

conda run -n oai-manager pip install -q \
  fastapi "uvicorn[standard]" docker websockets pydantic requests 2>&1 | tail -3
ok "Python packages installed"

# ════════════════════════════════════════════════════════════
# STEP 8 — Frontend
# ════════════════════════════════════════════════════════════
log "[8/8] Installing frontend dependencies..."
cd "$OAI_MGR_DIR/frontend"
npm install 2>&1 | tail -3
ok "Frontend dependencies installed"

# ── Write .env ────────────────────────────────────────────────
cat > "$OAI_MGR_DIR/.env" << ENV
# Generated by install.sh on $(date)
# Edit these paths if your installation is in different locations.
CORE_DIR=${CORE_DIR}
RAN_DIR=${RAN_DIR}
FLEXRIC_BUILD=${FLEXRIC_BUILD}
XAPP_BIN=${XAPP_BIN}
ENV

ok ".env written to $OAI_MGR_DIR/.env"

# ── Done ──────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}╔══════════════════════════════════════════╗"
echo -e "║      Installation complete! ✓            ║"
echo -e "╚══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${CYAN}cat $OAI_MGR_DIR/.env${NC}  ← verify paths"
echo -e "  ${CYAN}bash run.sh${NC}            ← start everything"
echo -e "  ${CYAN}bash stop.sh${NC}           ← stop everything"
echo ""
