"""
routers/pcap.py — PCAP capture for OAI Manager

Interfaces:
  demo-oai   — 5G Core Docker bridge (GTP, NAS, SBI, SCTP)
  oaitun_ue1 — UE tunnel user plane
  lo         — loopback (E2AP between gNB and RIC)
  any        — all interfaces

Add to main.py:
  from routers import pcap
  app.include_router(pcap.router, prefix="/pcap", tags=["PCAP"])
"""

import asyncio, os, re
from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(tags=["PCAP"])

PCAP_DIR = Path.home() / "oai-manager" / "captures"
PCAP_DIR.mkdir(parents=True, exist_ok=True)

INTERFACES = {
    "demo-oai": {
        "label": "5G Core Network",
        "description": "GTP-U · GTP-C · NAS · SBI (HTTP/2) · SCTP — Docker bridge 192.168.70.0/26",
        "filter": "",
    },
    "oaitun_ue1": {
        "label": "UE Tunnel (User Plane)",
        "description": "IP traffic through the UE PDU session tunnel",
        "filter": "",
    },
    "lo": {
        "label": "Loopback — E2 / RIC",
        "description": "E2AP control messages between gNB and nearRT-RIC",
        "filter": "port 36421 or port 36422",
    },
    "any": {
        "label": "All Interfaces",
        "description": "Everything — largest files, best for full debugging",
        "filter": "",
    },
}

_capture: dict = {
    "running": False, "pid": None, "interface": None,
    "filename": None, "filepath": None, "started_at": None,
}
_proc = None


def _safe_name(name: str) -> str:
    return Path(name).name


async def _packet_count(filepath: Path) -> int:
    try:
        r = await asyncio.create_subprocess_exec(
            "tcpdump", "-r", str(filepath), "--count",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        _, err = await r.communicate()
        m = re.search(r"(\d+) packet", (err or b"").decode())
        return int(m.group(1)) if m else 0
    except Exception:
        return 0


class StartRequest(BaseModel):
    interface: str = "demo-oai"
    max_size_mb: int = 100
    label: str = ""


def _resolve_demo_oai() -> str | None:
    """Return the actual interface name for the 5G Core Docker bridge.

    Tries 'demo-oai' first (static name), then inspects the oai-public-access
    Docker network to find its bridge, and finally falls back to scanning
    'ip link' for any br-* or demo-oai* interface that is UP.
    """
    import subprocess as _sp
    # 1. Static name still present?
    if Path("/sys/class/net/demo-oai").exists():
        return "demo-oai"
    # 2. Ask Docker for the bridge name of oai-public-access
    try:
        r = _sp.run(
            ["docker", "network", "inspect", "oai-public-access",
             "--format", "{{.Id}}"],
            capture_output=True, text=True, timeout=5
        )
        if r.returncode == 0 and r.stdout.strip():
            bridge = "br-" + r.stdout.strip()[:12]
            if Path(f"/sys/class/net/{bridge}").exists():
                return bridge
    except Exception:
        pass
    # 3. Scan ip-link for any oai/5g-looking bridge
    try:
        r = _sp.run(["ip", "-o", "link", "show"], capture_output=True, text=True, timeout=5)
        for line in r.stdout.splitlines():
            for kw in ("demo-oai", "oai"):
                if kw in line.lower():
                    name = line.split(":")[1].strip().split("@")[0]
                    if Path(f"/sys/class/net/{name}").exists():
                        return name
    except Exception:
        pass
    return None


@router.get("/interfaces")
def list_interfaces():
    result = {}
    bridge = _resolve_demo_oai()
    for iface, info in INTERFACES.items():
        if iface == "demo-oai":
            actual = bridge or "demo-oai"
            avail = bridge is not None
            result[iface] = {**info, "available": avail, "actual_interface": actual}
        elif iface == "any":
            result[iface] = {**info, "available": True}
        else:
            result[iface] = {**info, "available": Path(f"/sys/class/net/{iface}").exists()}
    return result


@router.post("/start")
async def start_capture(req: StartRequest):
    global _proc, _capture
    if _capture["running"]:
        raise HTTPException(400, detail="Capture already running — stop it first.")
    if req.interface not in INTERFACES:
        raise HTTPException(400, detail=f"Unknown interface. Choose: {list(INTERFACES.keys())}")

    # Resolve demo-oai to actual bridge name
    actual_iface = req.interface
    if req.interface == "demo-oai":
        bridge = _resolve_demo_oai()
        if bridge is None:
            raise HTTPException(400, detail="demo-oai bridge not found — is the 5G Core running?")
        actual_iface = bridge

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    label_part = f"_{req.label}" if req.label else ""
    filename = f"capture_{req.interface}{label_part}_{ts}.pcap"
    filepath = PCAP_DIR / filename

    cmd = [
        "sudo", "tcpdump", "-Z", "root",
        "-i", actual_iface,
        "-w", str(filepath),
        "-n", "--immediate-mode", "-s", "0",
    ]
    if req.max_size_mb > 0:
        cmd += ["-C", str(req.max_size_mb)]
    bpf = INTERFACES[req.interface].get("filter", "")
    if bpf:
        cmd.append(bpf)

    try:
        _proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        _capture = {
            "running": True, "pid": _proc.pid,
            "interface": req.interface,
            "interface_label": INTERFACES[req.interface]["label"],
            "filename": filename, "filepath": str(filepath),
            "started_at": datetime.now().isoformat(),
            "max_size_mb": req.max_size_mb,
        }
        return {"status": "started", "filename": filename, "pid": _proc.pid}
    except Exception as e:
        raise HTTPException(500, detail=f"tcpdump failed: {e}")


@router.post("/stop")
async def stop_capture():
    global _proc, _capture
    if not _capture["running"]:
        raise HTTPException(400, detail="No capture running.")

    filename = _capture["filename"]
    filepath = Path(_capture["filepath"])

    try:
        await asyncio.create_subprocess_exec(
            "sudo", "kill", "-SIGTERM", str(_capture["pid"]),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        if _proc:
            try: await asyncio.wait_for(_proc.communicate(), timeout=5)
            except asyncio.TimeoutError: _proc.kill()
    except Exception:
        pass

    size_mb = round(filepath.stat().st_size / 1e6, 2) if filepath.exists() else 0
    packets = await _packet_count(filepath) if filepath.exists() else 0

    _capture = {"running": False, "pid": None, "interface": None,
                "filename": None, "filepath": None, "started_at": None}
    _proc = None

    return {"status": "stopped", "filename": filename,
            "size_mb": size_mb, "packets": packets}


@router.get("/status")
async def capture_status():
    info = dict(_capture)
    if _capture["running"] and _capture.get("filepath"):
        fp = Path(_capture["filepath"])
        if fp.exists():
            info["current_size_mb"] = round(fp.stat().st_size / 1e6, 2)
    return info


@router.get("/list")
async def list_captures():
    files = []
    for f in sorted(PCAP_DIR.glob("*.pcap"),
                    key=lambda x: x.stat().st_mtime, reverse=True):
        files.append({
            "filename": f.name,
            "size_mb": round(f.stat().st_size / 1e6, 2),
            "size_bytes": f.stat().st_size,
            "created_at": datetime.fromtimestamp(
                f.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S"),
            "is_active": f.name == _capture.get("filename"),
        })
    return {"files": files, "total": len(files),
            "capture_dir": str(PCAP_DIR)}


@router.get("/download/{filename}")
async def download_capture(filename: str):
    fp = PCAP_DIR / _safe_name(filename)
    if not fp.exists():
        raise HTTPException(404, detail=f"Not found: {filename}")
    return FileResponse(str(fp), filename=fp.name,
                        media_type="application/vnd.tcpdump.pcap")


@router.delete("/delete/{filename}")
async def delete_capture(filename: str):
    safe = _safe_name(filename)
    if safe == _capture.get("filename") and _capture["running"]:
        raise HTTPException(400, detail="Cannot delete active capture file.")
    fp = PCAP_DIR / safe
    if not fp.exists():
        raise HTTPException(404, detail=f"Not found: {filename}")
    fp.unlink()
    return {"status": "deleted", "filename": safe}
