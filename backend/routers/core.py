import asyncio
import os
import subprocess
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import docker

router = APIRouter()
docker_client = docker.from_env()

COMPOSE_DIR = os.path.expanduser("~/oai-cn5g")

CORE_CONTAINERS = [
    "mysql",
    "ims",
    "oai-ext-dn",
    "oai-nrf",
    "oai-udr",
    "oai-udm",
    "oai-ausf",
    "oai-amf",
    "oai-smf",
    "oai-upf",
]


@router.post("/start")
def start_core():
    """Start OAI 5G Core via docker compose up -d"""
    try:
        result = subprocess.run(
            ["docker", "compose", "up", "-d"],
            cwd=COMPOSE_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        return {
            "status": "started" if result.returncode == 0 else "error",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/stop")
def stop_core():
    """Stop OAI 5G Core via docker compose down"""
    try:
        result = subprocess.run(
            ["docker", "compose", "down"],
            cwd=COMPOSE_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        return {
            "status": "stopped" if result.returncode == 0 else "error",
            "stdout": result.stdout,
            "stderr": result.stderr,
            "returncode": result.returncode
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/restart")
def restart_core():
    """Restart OAI 5G Core"""
    try:
        subprocess.run(["docker", "compose", "down"], cwd=COMPOSE_DIR, timeout=120)
        result = subprocess.run(
            ["docker", "compose", "up", "-d"],
            cwd=COMPOSE_DIR,
            capture_output=True,
            text=True,
            timeout=120
        )
        return {
            "status": "restarted" if result.returncode == 0 else "error",
            "stdout": result.stdout,
            "stderr": result.stderr
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.get("/status")
def get_core_status():
    """Get status of all core containers"""
    statuses = []
    for name in CORE_CONTAINERS:
        try:
            container = docker_client.containers.get(name)
            statuses.append({
                "name": name,
                "status": container.status,
                "image": container.image.tags[0] if container.image.tags else "unknown",
                "id": container.short_id
            })
        except docker.errors.NotFound:
            statuses.append({
                "name": name,
                "status": "not_found",
                "image": "-",
                "id": "-"
            })
        except Exception as e:
            statuses.append({
                "name": name,
                "status": "error",
                "error": str(e)
            })
    return {"containers": statuses}


@router.websocket("/logs/{container_name}")
async def stream_container_logs(websocket: WebSocket, container_name: str):
    """Stream live logs from a specific container via WebSocket"""
    await websocket.accept()
    try:
        process = await asyncio.create_subprocess_exec(
            "docker", "logs", "-f", "--tail", "100", container_name,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            await websocket.send_text(line.decode("utf-8", errors="replace"))
    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_text(f"[ERROR] {str(e)}")
