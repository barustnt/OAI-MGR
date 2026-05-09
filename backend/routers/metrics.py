"""
routers/metrics.py — Fixed: always scans full buffer for latest MAC TX/RX values.
"""

import asyncio
import re
import docker
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime

router = APIRouter(tags=["Metrics"])
docker_client = docker.from_env()

metrics_store = {
    "ues": {},
    "gnb": [],
    "amf_ues": [],
    "throughput": [],
}

MAX_THROUGHPUT_HISTORY = 1800

MAC_RE  = re.compile(r"UE\s+(\S+):\s+MAC:\s+TX\s+(\d+)\s+RX\s+(\d+)\s+bytes")
LCID_RE = re.compile(r"UE\s+(\S+):\s+LCID\s+(\d+):\s+TX\s+(\d+)\s+RX\s+(\d+)\s+bytes")


def parse_amf_ue_table(line):
    if "|" not in line:
        return None
    parts = [p.strip() for p in line.split("|") if p.strip()]
    if len(parts) >= 7 and parts[0].isdigit():
        return {
            "index": parts[0], "state": parts[1], "imsi": parts[2],
            "guti": parts[3], "ran_ue_ngap_id": parts[4],
            "amf_ue_ngap_id": parts[5], "plmn": parts[6],
            "cell_id": parts[7] if len(parts) > 7 else "-",
        }
    return None


def parse_amf_gnb_table(line):
    if "|" not in line:
        return None
    parts = [p.strip() for p in line.split("|") if p.strip()]
    if len(parts) >= 4 and parts[0].isdigit():
        return {
            "index": parts[0], "status": parts[1],
            "global_id": parts[2], "gnb_name": parts[3],
            "plmn": parts[4] if len(parts) > 4 else "-",
        }
    return None


async def collect_gnb_metrics():
    """
    Every second scan the FULL gnb_log_buffer.
    MAC lines are cumulative counters — later lines overwrite earlier ones
    so we naturally get the most recent value for each UE.
    Throughput delta = difference between current and previous tick totals.
    """
    from routers.gnb import gnb_log_buffer

    prev_totals = {"tx": 0, "rx": 0}
    first_tick = True

    while True:
        await asyncio.sleep(1)

        snapshot = list(gnb_log_buffer)

        # Scan ALL lines — last occurrence of each UE wins
        latest_mac: dict = {}
        latest_lcid: dict = {}

        for line in snapshot:
            m = MAC_RE.search(line)
            if m:
                latest_mac[m.group(1)] = (int(m.group(2)), int(m.group(3)))
            lm = LCID_RE.search(line)
            if lm:
                ue_id = lm.group(1)
                if ue_id not in latest_lcid:
                    latest_lcid[ue_id] = {}
                latest_lcid[ue_id][lm.group(2)] = {
                    "tx": int(lm.group(3)), "rx": int(lm.group(4))
                }

        now = datetime.utcnow().isoformat()

        # Update store
        for ue_id, (tx, rx) in latest_mac.items():
            ue = metrics_store["ues"].setdefault(ue_id, {
                "tx": 0, "rx": 0, "lcids": {}, "last_seen": None
            })
            ue["tx"] = tx
            ue["rx"] = rx
            ue["last_seen"] = now
            if ue_id in latest_lcid:
                ue["lcids"] = latest_lcid[ue_id]

        # Reset on gNB restart (buffer cleared)
        if len(snapshot) == 0 and metrics_store["ues"]:
            metrics_store["ues"] = {}
            prev_totals = {"tx": 0, "rx": 0}
            first_tick = True

        total_tx = sum(u["tx"] for u in metrics_store["ues"].values())
        total_rx = sum(u["rx"] for u in metrics_store["ues"].values())

        # First tick after start: no delta yet, just seed prev_totals
        if first_tick:
            prev_totals = {"tx": total_tx, "rx": total_rx}
            first_tick = False
            delta_tx = delta_rx = 0
        else:
            delta_tx = max(0, total_tx - prev_totals["tx"])
            delta_rx = max(0, total_rx - prev_totals["rx"])
            prev_totals = {"tx": total_tx, "rx": total_rx}

        metrics_store["throughput"].append({
            "timestamp": now,
            "total_tx": total_tx,
            "total_rx": total_rx,
            "delta_tx": delta_tx,
            "delta_rx": delta_rx,
            "ue_count": len(metrics_store["ues"]),
        })

        if len(metrics_store["throughput"]) > MAX_THROUGHPUT_HISTORY:
            metrics_store["throughput"] = metrics_store["throughput"][-MAX_THROUGHPUT_HISTORY:]


async def collect_amf_metrics():
    while True:
        await asyncio.sleep(5)
        try:
            container = docker_client.containers.get("oai-amf")
            logs = container.logs(tail=200).decode("utf-8", errors="replace")
            ues, gnbs = [], []
            in_ue = in_gnb = False
            for line in logs.splitlines():
                if "UEs' Information" in line:
                    in_ue, in_gnb = True, False; continue
                if "gNBs' Information" in line:
                    in_gnb, in_ue = True, False; continue
                if in_ue:
                    r = parse_amf_ue_table(line)
                    if r: ues.append(r)
                if in_gnb:
                    r = parse_amf_gnb_table(line)
                    if r: gnbs.append(r)
            if ues:
                seen: set = set()
                metrics_store["amf_ues"] = [
                    r for r in ues
                    if r.get("imsi") not in seen and not seen.add(r.get("imsi"))
                ]
            if gnbs:
                seen = set()
                metrics_store["gnb"] = [
                    r for r in gnbs
                    if (r.get("index"), r.get("global_id")) not in seen
                    and not seen.add((r.get("index"), r.get("global_id")))
                ]
        except Exception:
            pass


@router.get("/snapshot")
def get_metrics_snapshot():
    return {
        "ues": metrics_store["ues"],
        "gnb": metrics_store["gnb"],
        "amf_ues": metrics_store["amf_ues"],
        "throughput_history": metrics_store["throughput"][-60:],
        "ue_count": len(metrics_store["ues"]),
    }


@router.websocket("/stream")
async def stream_metrics(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            await asyncio.sleep(1)
            tp = metrics_store["throughput"]
            await websocket.send_json({
                "ues": metrics_store["ues"],
                "gnb": metrics_store["gnb"],
                "amf_ues": metrics_store["amf_ues"],
                "throughput": tp[-1] if tp else None,
                "ue_count": len(metrics_store["ues"]),
            })
    except WebSocketDisconnect:
        pass
