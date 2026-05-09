"""
routers/gnb.py — gNB (nr-softmodem) process control
Uses /usr/local/bin/kill_oai wrapper to safely terminate processes.
"""

import asyncio
import os
import signal
from collections import deque
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(tags=["gNB"])

# ── Config ────────────────────────────────────────────────────────────────────
GNB_DIR  = os.path.expanduser(
    "~/openairinterface5g/cmake_targets/ran_build/build"
)
GNB_CONF = (
    "../../../targets/PROJECTS/GENERIC-NR-5GC/CONF/"
    "gnb.sa.band78.fr1.106PRB.usrpb210.conf"
)
KILL_OAI = "/usr/local/bin/kill_oai"
LOG_BUFFER_SIZE = 500

# ── State ─────────────────────────────────────────────────────────────────────
gnb_process: asyncio.subprocess.Process | None = None
gnb_log_buffer: deque = deque(maxlen=LOG_BUFFER_SIZE)
gnb_mode: str = "hw"
gnb_scope: bool = False
gnb_watchdog_enabled: bool = False
gnb_watchdog_task: asyncio.Task | None = None
log_subscribers: list[WebSocket] = []


# ── Schemas ───────────────────────────────────────────────────────────────────
class GnbStartRequest(BaseModel):
    mode: str = "hw"   # "hw" | "rfsim"
    scope: bool = False


# ── Helpers ───────────────────────────────────────────────────────────────────
def _build_command(mode: str, scope: bool) -> list[str]:
    cmd = ["sudo", "./nr-softmodem", "-O", GNB_CONF]
    if mode == "hw":
        cmd += ["-E", "--continuous-tx"]
    else:  # rfsim
        cmd += ["--gNBs.[0].min_rxtxtime", "6", "--rfsim", "--sa"]
    if scope:
        cmd.append("-d")
    return cmd


async def _kill_gnb_safe():
    """Kill existing gNB process using the kill_oai wrapper."""
    global gnb_process
    if gnb_process is not None:
        pid = gnb_process.pid
        try:
            proc = await asyncio.create_subprocess_exec(
                "sudo", KILL_OAI, "nr-softmodem", str(pid),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await proc.communicate()
        except Exception:
            pass
        try:
            gnb_process.kill()
        except Exception:
            pass
        gnb_process = None

    # Belt-and-suspenders: kill any stray nr-softmodem processes
    try:
        stray = await asyncio.create_subprocess_exec(
            "sudo", KILL_OAI, "nr-softmodem",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await stray.communicate()
    except Exception:
        pass


async def _stream_logs(proc: asyncio.subprocess.Process):
    """Read stdout/stderr of the gNB process and push to buffer + subscribers."""
    async def read_stream(stream):
        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode(errors="replace").rstrip()
            ts = datetime.now().strftime("%H:%M:%S")
            entry = f"[{ts}] {text}"
            gnb_log_buffer.append(entry)
            dead = []
            for ws in log_subscribers:
                try:
                    await ws.send_text(entry)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                log_subscribers.remove(ws)

    tasks = []
    if proc.stdout:
        tasks.append(asyncio.create_task(read_stream(proc.stdout)))
    if proc.stderr:
        tasks.append(asyncio.create_task(read_stream(proc.stderr)))
    if tasks:
        await asyncio.gather(*tasks)


async def _watchdog_loop(mode: str, scope: bool):
    """Restart gNB automatically if it crashes."""
    global gnb_process
    while gnb_watchdog_enabled:
        await asyncio.sleep(5)
        if gnb_process is None or gnb_process.returncode is not None:
            if gnb_watchdog_enabled:
                _log_internal("[WATCHDOG] gNB down — restarting...")
                await _start_gnb(mode, scope)


def _log_internal(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    gnb_log_buffer.append(entry)


async def _start_gnb(mode: str, scope: bool):
    """Internal helper — kill any existing process then launch a fresh one."""
    global gnb_process, gnb_mode, gnb_scope

    # Always kill first to avoid accumulation
    await _kill_gnb_safe()
    gnb_log_buffer.clear()

    gnb_mode = mode
    gnb_scope = scope
    cmd = _build_command(mode, scope)

    _log_internal(f"[OAI Manager] Starting gNB: {' '.join(cmd)}")

    gnb_process = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=GNB_DIR,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    asyncio.create_task(_stream_logs(gnb_process))


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_gnb(req: GnbStartRequest):
    await _start_gnb(req.mode, req.scope)
    return {"status": "started", "mode": req.mode, "scope": req.scope, "pid": gnb_process.pid}


@router.post("/stop")
async def stop_gnb():
    global gnb_watchdog_enabled, gnb_watchdog_task
    gnb_watchdog_enabled = False
    if gnb_watchdog_task:
        gnb_watchdog_task.cancel()
        gnb_watchdog_task = None
    await _kill_gnb_safe()
    _log_internal("[OAI Manager] gNB stopped.")
    return {"status": "stopped"}


@router.post("/restart")
async def restart_gnb(req: GnbStartRequest):
    await _kill_gnb_safe()
    gnb_log_buffer.clear()
    await _start_gnb(req.mode, req.scope)
    return {"status": "restarted", "mode": req.mode, "pid": gnb_process.pid}


@router.get("/status")
async def gnb_status():
    running = gnb_process is not None and gnb_process.returncode is None
    return {
        "status": "running" if running else "stopped",
        "pid": gnb_process.pid if running else None,
        "mode": gnb_mode,
        "scope": gnb_scope,
        "watchdog": gnb_watchdog_enabled,
    }


@router.get("/logs")
async def gnb_logs():
    return {"logs": list(gnb_log_buffer)}


@router.websocket("/logs/stream")
async def gnb_logs_stream(websocket: WebSocket):
    await websocket.accept()
    # Send existing buffer first
    for line in list(gnb_log_buffer):
        await websocket.send_text(line)
    log_subscribers.append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep alive
    except WebSocketDisconnect:
        if websocket in log_subscribers:
            log_subscribers.remove(websocket)


@router.post("/watchdog/enable")
async def enable_watchdog(req: GnbStartRequest):
    global gnb_watchdog_enabled, gnb_watchdog_task
    gnb_watchdog_enabled = True
    gnb_watchdog_task = asyncio.create_task(_watchdog_loop(req.mode, req.scope))
    return {"watchdog": "enabled", "mode": req.mode}


@router.post("/watchdog/disable")
async def disable_watchdog():
    global gnb_watchdog_enabled, gnb_watchdog_task
    gnb_watchdog_enabled = False
    if gnb_watchdog_task:
        gnb_watchdog_task.cancel()
        gnb_watchdog_task = None
    return {"watchdog": "disabled"}
