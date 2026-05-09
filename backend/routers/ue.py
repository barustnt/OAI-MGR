"""
routers/ue.py — UE (nr-uesoftmodem RFSIM) process control
Uses /usr/local/bin/kill_oai wrapper to safely terminate processes.
"""

import asyncio
import os
from collections import deque
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import BaseModel

router = APIRouter(tags=["UE"])

# ── Config ────────────────────────────────────────────────────────────────────
UE_DIR   = os.path.expanduser(
    "~/openairinterface5g/cmake_targets/ran_build/build"
)
KILL_OAI = "/usr/local/bin/kill_oai"
LOG_BUFFER_SIZE = 500

# ── State ─────────────────────────────────────────────────────────────────────
# keyed by IMSI string
ue_processes:     dict[str, asyncio.subprocess.Process] = {}
ue_log_buffers:   dict[str, deque] = {}
ue_log_subs:      dict[str, list[WebSocket]] = {}
ue_params_store:  dict[str, dict] = {}


# ── Schemas ───────────────────────────────────────────────────────────────────
class UeStartRequest(BaseModel):
    imsi: str
    rb: str = "106"
    numerology: str = "1"
    band: str = "78"
    carrier_freq: str = "3619200000"
    rfsimulator_addr: str = "127.0.0.1"
    scope: bool = False


class UeStopRequest(BaseModel):
    imsi: str


# ── Helpers ───────────────────────────────────────────────────────────────────
def _build_ue_command(req: UeStartRequest) -> list[str]:
    cmd = [
        "sudo", "./nr-uesoftmodem",
        "-r", req.rb,
        "--numerology", req.numerology,
        "--band", req.band,
        "-C", req.carrier_freq,
        f"--uicc0.imsi", req.imsi,
        "--rfsim",
        "--rfsimulator.serveraddr", req.rfsimulator_addr,
    ]
    if req.scope:
        cmd.append("-d")
    return cmd


def _ensure_ue_state(imsi: str):
    if imsi not in ue_log_buffers:
        ue_log_buffers[imsi] = deque(maxlen=LOG_BUFFER_SIZE)
    if imsi not in ue_log_subs:
        ue_log_subs[imsi] = []


def _log_ue(imsi: str, msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    ue_log_buffers[imsi].append(entry)


async def _kill_ue_safe(imsi: str):
    """Kill a UE process by IMSI using the kill_oai wrapper."""
    proc = ue_processes.get(imsi)
    if proc is not None:
        pid = proc.pid
        try:
            killer = await asyncio.create_subprocess_exec(
                "sudo", KILL_OAI, "nr-uesoftmodem", str(pid),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await killer.communicate()
        except Exception:
            pass
        try:
            proc.kill()
        except Exception:
            pass
        del ue_processes[imsi]


async def _kill_all_ue_safe():
    """Kill ALL running UE processes."""
    imsis = list(ue_processes.keys())
    for imsi in imsis:
        await _kill_ue_safe(imsi)
    # Sweep for any stragglers not tracked
    try:
        stray = await asyncio.create_subprocess_exec(
            "sudo", KILL_OAI, "nr-uesoftmodem",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await stray.communicate()
    except Exception:
        pass


async def _stream_ue_logs(imsi: str, proc: asyncio.subprocess.Process):
    """Stream stdout/stderr of a UE process into its buffer and subscribers."""
    async def read_stream(stream):
        while True:
            line = await stream.readline()
            if not line:
                break
            text = line.decode(errors="replace").rstrip()
            ts = datetime.now().strftime("%H:%M:%S")
            entry = f"[{ts}] {text}"
            ue_log_buffers[imsi].append(entry)
            dead = []
            for ws in ue_log_subs.get(imsi, []):
                try:
                    await ws.send_text(entry)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                ue_log_subs[imsi].remove(ws)

    tasks = []
    if proc.stdout:
        tasks.append(asyncio.create_task(read_stream(proc.stdout)))
    if proc.stderr:
        tasks.append(asyncio.create_task(read_stream(proc.stderr)))
    if tasks:
        await asyncio.gather(*tasks)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/start")
async def start_ue(req: UeStartRequest):
    _ensure_ue_state(req.imsi)

    # Kill existing UE with this IMSI first
    if req.imsi in ue_processes:
        await _kill_ue_safe(req.imsi)
        ue_log_buffers[req.imsi].clear()

    ue_params_store[req.imsi] = req.model_dump()
    cmd = _build_ue_command(req)
    _log_ue(req.imsi, f"[OAI Manager] Starting UE {req.imsi}: {' '.join(cmd)}")

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        cwd=UE_DIR,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    ue_processes[req.imsi] = proc
    asyncio.create_task(_stream_ue_logs(req.imsi, proc))

    return {"status": "started", "imsi": req.imsi, "pid": proc.pid}


@router.post("/stop")
async def stop_ue(req: UeStopRequest):
    if req.imsi not in ue_processes:
        return {"status": "not_found", "imsi": req.imsi}
    _ensure_ue_state(req.imsi)
    await _kill_ue_safe(req.imsi)
    _log_ue(req.imsi, f"[OAI Manager] UE {req.imsi} stopped.")
    return {"status": "stopped", "imsi": req.imsi}


@router.post("/stop_all")
async def stop_all_ues():
    count = len(ue_processes)
    await _kill_all_ue_safe()
    return {"status": "stopped_all", "count": count}


@router.get("/status")
async def ue_status():
    result = []
    for imsi, proc in ue_processes.items():
        running = proc.returncode is None
        result.append({
            "imsi": imsi,
            "status": "running" if running else "stopped",
            "pid": proc.pid if running else None,
            "params": ue_params_store.get(imsi, {}),
        })
    return {"ues": result}


@router.get("/logs/{imsi}")
async def ue_logs(imsi: str):
    buf = ue_log_buffers.get(imsi, deque())
    return {"imsi": imsi, "logs": list(buf)}


@router.websocket("/logs/stream/{imsi}")
async def ue_logs_stream(websocket: WebSocket, imsi: str):
    await websocket.accept()
    _ensure_ue_state(imsi)
    # Send existing buffer
    for line in list(ue_log_buffers.get(imsi, [])):
        await websocket.send_text(line)
    ue_log_subs[imsi].append(websocket)
    try:
        while True:
            await websocket.receive_text()  # keep-alive
    except WebSocketDisconnect:
        if websocket in ue_log_subs.get(imsi, []):
            ue_log_subs[imsi].remove(websocket)


@router.get("/ip")
async def get_ue_ip():
    """
    Discover the UE tunnel IP address from the oaitun_ue1 interface.
    Returns {"ip": "12.1.1.x"} or {"ip": null} if not found.
    """
    import re
    try:
        proc = await asyncio.create_subprocess_exec(
            "ip", "addr", "show", "oaitun_ue1",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        output = stdout.decode(errors="replace")
        # Extract IPv4 address
        m = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)/", output)
        if m:
            return {"ip": m.group(1), "interface": "oaitun_ue1"}
        # Fallback: try any oaitun interface
        proc2 = await asyncio.create_subprocess_exec(
            "ip", "addr",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout2, _ = await proc2.communicate()
        output2 = stdout2.decode(errors="replace")
        lines = output2.splitlines()
        in_oaitun = False
        for line in lines:
            if "oaitun" in line:
                in_oaitun = True
            if in_oaitun and "inet " in line:
                m2 = re.search(r"inet\s+(\d+\.\d+\.\d+\.\d+)/", line)
                if m2:
                    return {"ip": m2.group(1), "interface": "oaitun"}
    except Exception as e:
        return {"ip": None, "error": str(e)}
    return {"ip": None, "error": "oaitun interface not found — is the UE running?"}
