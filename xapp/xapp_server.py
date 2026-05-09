"""
xapp_server.py — FastAPI bridge between OAI Manager and FlexRIC
Calls xapp_slice_ctrl (C binary) via subprocess for real slice control.

Run: python3 xapp_server.py
Listens on: http://localhost:7000
"""

import os
import sys
import time
import asyncio
import logging
import subprocess
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [xApp-Server] %(levelname)s: %(message)s"
)
log = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
FLEXRIC_BUILD = os.path.expanduser(
    "~/openairinterface5g/openair2/E2AP/flexric/build"
)
XAPP_SLICE_DIR = os.path.join(FLEXRIC_BUILD, "examples/xApp/c/slice")

# Our custom C xApp binary (built from xapp_slice_ctrl.c)
XAPP_BINARY = os.path.join(XAPP_SLICE_DIR, "xapp_slice_ctrl")

# Fallback: the stock monitor+ctrl binary (does ADD/DEL/ASSOC in sequence,
# not ideal for dynamic control, but useful for testing the E2 path)
XAPP_STOCK_BINARY = os.path.join(XAPP_SLICE_DIR, "xapp_slice_moni_ctrl")

# nearRT-RIC binary (to check if RIC is running)
NEARRT_RIC = os.path.join(FLEXRIC_BUILD, "examples/ric/nearRT-RIC")

# ── Slice parameters ──────────────────────────────────────────────────────────
# STATIC slice: pos_low/pos_high are PRB position indices (0–13 for 106PRB)
# Each unit ≈ 8 PRBs.  pos_high=10 → ~80%, pos_high=3 → ~25%
SLICE_CONFIG = {
    "high": {
        "pos_low": 0,
        "pos_high": 10,
        "prb_pct": 80,
        "label": "HIGH (80% PRBs, pos 0–10)",
        "description": "شبكة سريعة - Fast Network",
    },
    "low": {
        "pos_low": 0,
        "pos_high": 3,
        "prb_pct": 25,
        "label": "LOW (25% PRBs, pos 0–3)",
        "description": "شبكة بطيئة - Slow Network",
    },
}

# ── State ─────────────────────────────────────────────────────────────────────
current_slice: dict = {"speed": None, "applied_at": None, "prb_pct": None, "label": None}

# ── Detect available mode ─────────────────────────────────────────────────────
def _check_binary(path: str) -> bool:
    p = os.path.expanduser(path)
    return os.path.isfile(p) and os.access(p, os.X_OK)

def _ric_is_running() -> bool:
    """Check if nearRT-RIC process is alive."""
    try:
        result = subprocess.run(
            ["pgrep", "-x", "nearRT-RIC"],
            capture_output=True, timeout=3
        )
        return result.returncode == 0
    except Exception:
        return False

custom_binary_available = _check_binary(XAPP_BINARY)
stock_binary_available  = _check_binary(XAPP_STOCK_BINARY)
ric_running             = _ric_is_running()

if custom_binary_available:
    log.info(f"✅ Custom slice xApp found: {XAPP_BINARY}")
    mode_label = "real-custom"
elif stock_binary_available:
    log.warning(f"⚠️  Custom binary not found. Stock binary available: {XAPP_STOCK_BINARY}")
    log.warning("   Stock binary runs a fixed sequence (ADD/DEL/ASSOC) — not designed for dynamic control.")
    log.warning("   Build xapp_slice_ctrl.c for full functionality.")
    mode_label = "real-stock"
else:
    log.warning("⚠️  No FlexRIC xApp binary found — SIMULATION MODE")
    mode_label = "simulation"

if ric_running:
    log.info("✅ nearRT-RIC is running")
else:
    log.warning("⚠️  nearRT-RIC not detected — slice commands will fail without it")

# ── FastAPI ───────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Network Slicing Demo xApp Server",
    description="OAI Manager — Network Slicing xApp Server",
    version="2.0.0",
)

# ── Models ────────────────────────────────────────────────────────────────────
class SliceRequest(BaseModel):
    speed: str  # "high" | "low"

class SliceResponse(BaseModel):
    success: bool
    speed: str
    prb_pct: int
    label: str
    message: str
    mode: str
    stdout: str = ""

# ── Slice control ─────────────────────────────────────────────────────────────

def _run_custom_xapp(speed: str) -> tuple[bool, str]:
    """
    Run xapp_slice_ctrl --speed <high|low>
    Returns (success, stdout_text)
    """
    cfg = SLICE_CONFIG[speed]
    cmd = [
        os.path.expanduser(XAPP_BINARY),
        "--speed", speed,
        "-p", "/usr/local/lib/flexric/",
        "-c", "/usr/local/etc/flexric/flexric.conf",
    ]
    log.info(f"Running: {' '.join(cmd)}")
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=15,        # xApp connects, sends ctrl, exits
            cwd=XAPP_SLICE_DIR,
        )
        combined = result.stdout + result.stderr
        if result.returncode == 0 and "SUCCESS" in combined:
            log.info(f"✅ Slice control succeeded: {cfg['label']}")
            return True, combined
        else:
            log.error(f"xApp exited {result.returncode}:\n{combined}")
            return False, combined
    except subprocess.TimeoutExpired:
        log.error("xApp timed out — RIC may not be reachable")
        return False, "timeout: nearRT-RIC not reachable within 15s"
    except Exception as e:
        log.error(f"xApp launch error: {e}")
        return False, str(e)


def _run_simulation(speed: str) -> tuple[bool, str]:
    """Simulate slice control for testing without RIC."""
    cfg = SLICE_CONFIG[speed]
    msg = (
        f"[SIMULATION] Would send to FlexRIC:\n"
        f"  Algorithm: STATIC\n"
        f"  pos_low={cfg['pos_low']}, pos_high={cfg['pos_high']}\n"
        f"  PRBs: ~{cfg['prb_pct']}%\n"
        f"  Label: {cfg['label']}"
    )
    log.info(msg)
    time.sleep(0.3)
    return True, msg


def apply_slice(speed: str) -> tuple[bool, str, str]:
    """
    Returns (success, stdout, effective_mode)
    """
    ric_ok = _ric_is_running()

    if custom_binary_available and ric_ok:
        ok, out = _run_custom_xapp(speed)
        return ok, out, "real"
    elif not ric_ok and (custom_binary_available or stock_binary_available):
        log.warning("RIC not running — falling back to simulation")
        ok, out = _run_simulation(speed)
        return ok, out + "\n(RIC offline — used simulation)", "simulation-ric-down"
    else:
        ok, out = _run_simulation(speed)
        return ok, out, "simulation"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {
        "service": "Network Slicing Demo xApp Server v2",
        "mode": mode_label,
        "ric_running": _ric_is_running(),
        "custom_binary": custom_binary_available,
        "current_slice": current_slice,
    }

@app.get("/status")
def status():
    return {
        "mode": mode_label,
        "ric_running": _ric_is_running(),
        "custom_binary_path": XAPP_BINARY,
        "custom_binary_available": custom_binary_available,
        "current_slice": current_slice,
        "slice_configs": {
            k: {
                "pos_low": v["pos_low"],
                "pos_high": v["pos_high"],
                "prb_pct": v["prb_pct"],
                "label": v["label"],
            }
            for k, v in SLICE_CONFIG.items()
        },
    }

@app.post("/slice", response_model=SliceResponse)
def set_slice(req: SliceRequest):
    speed = req.speed.lower().strip()

    if speed not in SLICE_CONFIG:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid speed '{speed}'. Must be 'high' or 'low'."
        )

    cfg = SLICE_CONFIG[speed]
    log.info(f"Slice request: {speed} → {cfg['label']}")

    success, stdout, effective_mode = apply_slice(speed)

    if success:
        current_slice.update({
            "speed": speed,
            "applied_at": time.strftime("%H:%M:%S"),
            "prb_pct": cfg["prb_pct"],
            "label": cfg["label"],
        })
        return SliceResponse(
            success=True,
            speed=speed,
            prb_pct=cfg["prb_pct"],
            label=cfg["label"],
            message=f"Slice set to {cfg['description']}",
            mode=effective_mode,
            stdout=stdout,
        )
    else:
        raise HTTPException(
            status_code=500,
            detail=f"Slice control failed:\n{stdout}"
        )

# ── Build helper endpoint ─────────────────────────────────────────────────────
@app.get("/build-instructions")
def build_instructions():
    """Returns the exact commands to build xapp_slice_ctrl."""
    src = os.path.expanduser(
        "~/voic2slice/Network Slicing Demo_flexric_complete/xapp_slice_ctrl.c"
    )
    return {
        "source_file": src,
        "copy_command": f"cp {src} {XAPP_SLICE_DIR}/xapp_slice_ctrl.c",
        "build_commands": [
            f"cd {XAPP_SLICE_DIR}",
            (
                "gcc xapp_slice_ctrl.c "
                f"-I{os.path.expanduser('~/openairinterface5g/openair2/E2AP/flexric/src')} "
                f"-I{os.path.expanduser('~/openairinterface5g/openair2/E2AP/flexric')} "
                f"-L{FLEXRIC_BUILD}/src/xApp -le42_xapp_shared "
                "-L/usr/local/lib/flexric -lslice_sm "
                f"-Wl,-rpath,{FLEXRIC_BUILD}/src/xApp "
                "-Wl,-rpath,/usr/local/lib/flexric "
                "-o xapp_slice_ctrl"
            ),
        ],
        "test_command": f"{XAPP_BINARY} --speed high",
    }

# ── Main ──────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("=" * 60)
    log.info("Network Slicing Demo xApp Server v2 starting...")
    log.info(f"Mode: {mode_label}")
    log.info(f"RIC running: {ric_running}")
    log.info(f"Custom binary: {XAPP_BINARY}")
    log.info(f"Binary available: {custom_binary_available}")
    if not custom_binary_available:
        log.warning("Build xapp_slice_ctrl.c first!")
        log.warning("Visit http://localhost:7000/build-instructions for commands")
    log.info("API: http://localhost:7000")
    log.info("=" * 60)

    uvicorn.run(app, host="0.0.0.0", port=7000, log_level="info")
