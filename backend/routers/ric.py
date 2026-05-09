import asyncio
import os
import signal
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# ── Path to nearRT-RIC binary ─────────────────────────────────────────────────
_FLEXRIC_BUILD = os.path.expanduser(
    "~/openairinterface5g/openair2/E2AP/flexric/build"
)
RIC_BINARY = os.path.join(_FLEXRIC_BUILD, "examples/ric/nearRT-RIC")
RIC_DIR    = _FLEXRIC_BUILD

ric_process = None
ric_log_lines = []
MAX_LOG_LINES = 500


@router.post("/start")
async def start_ric():
    global ric_process, ric_log_lines

    if ric_process and ric_process.returncode is None:
        return {"status": "already_running", "pid": ric_process.pid}

    ric_log_lines = []

    try:
        ric_process = await asyncio.create_subprocess_exec(
            RIC_BINARY,
            cwd=RIC_DIR,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            preexec_fn=os.setsid
        )
        asyncio.create_task(_capture_ric_logs())
        return {"status": "started", "pid": ric_process.pid}
    except FileNotFoundError:
        return {
            "status": "error",
            "message": f"nearRT-RIC binary not found at {RIC_BINARY}. Build FlexRIC first: cd ~/openairinterface5g/openair2/E2AP/flexric && mkdir build && cd build && cmake .. && make -j$(nproc) && sudo make install"
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/stop")
async def stop_ric():
    global ric_process
    if ric_process:
        try:
            os.killpg(os.getpgid(ric_process.pid), signal.SIGTERM)
            await asyncio.wait_for(ric_process.wait(), timeout=10)
        except Exception:
            try:
                os.killpg(os.getpgid(ric_process.pid), signal.SIGKILL)
            except Exception:
                pass
        ric_process = None
        return {"status": "stopped"}
    return {"status": "not_running"}


@router.post("/restart")
async def restart_ric():
    await stop_ric()
    await asyncio.sleep(2)
    return await start_ric()


@router.get("/status")
def get_ric_status():
    global ric_process
    if ric_process is None:
        return {"status": "not_running", "pid": None}
    if ric_process.returncode is None:
        return {"status": "running", "pid": ric_process.pid}
    return {"status": "stopped", "pid": ric_process.pid, "returncode": ric_process.returncode}


@router.get("/logs")
def get_ric_log_buffer():
    return {"lines": ric_log_lines[-MAX_LOG_LINES:]}


@router.websocket("/logs/stream")
async def stream_ric_logs(websocket: WebSocket):
    await websocket.accept()
    for line in ric_log_lines[-100:]:
        await websocket.send_text(line)
    try:
        last_len = len(ric_log_lines)
        while True:
            await asyncio.sleep(0.1)
            if len(ric_log_lines) > last_len:
                for line in ric_log_lines[last_len:]:
                    await websocket.send_text(line)
                last_len = len(ric_log_lines)
    except WebSocketDisconnect:
        pass
    finally:
        await websocket.close()


async def _capture_ric_logs():
    global ric_process, ric_log_lines
    if ric_process is None:
        return
    async def read_stream(stream):
        while True:
            line = await stream.readline()
            if not line:
                break
            decoded = line.decode("utf-8", errors="replace").rstrip()
            ric_log_lines.append(decoded)
            if len(ric_log_lines) > MAX_LOG_LINES:
                ric_log_lines = ric_log_lines[-MAX_LOG_LINES:]
    await asyncio.gather(
        read_stream(ric_process.stdout),
        read_stream(ric_process.stderr)
    )

