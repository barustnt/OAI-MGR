# OAI Manager

Open-source web platform for managing OpenAirInterface 5G Standalone networks.
Control your 5G Core, gNB, UE, and RAN slicing from a browser — no terminal required.

---

## Overview

OAI Manager is a full-stack web application built on top of OpenAirInterface (OAI).
It provides a clean browser interface to start, stop, and monitor every component
of a 5G SA network, and includes real-time PRB-level slice control via a FlexRIC
near-RT RIC using the E2 interface.

The platform targets researchers and engineers working with OAI in software
simulation mode (RFSIM) or with real hardware (USRP B210).

---

## Features

- **5G Core** — start, stop, restart the OAI CN5G Docker Compose stack with one click
- **gNB** — launch and monitor nr-softmodem in RFSIM or hardware mode
- **UE** — manage multiple software UEs with individual log streams
- **Network Slicing** — switch between HIGH (80% PRBs) and LOW (25% PRBs) allocation via FlexRIC E2AP
- **Live Metrics** — real-time throughput chart, connected UE table, gNB table
- **PCAP Capture** — capture on any 5G interface and download for Wireshark
- **Config Editor** — edit gNB and core config files in the browser with automatic backup
- **Auto-start** — nearRT-RIC starts automatically with the 5G Core

---

## Requirements

- Ubuntu 22.04 or 24.04 (x86_64)
- 16 GB RAM recommended
- 50 GB free disk space
- Internet connection for first install

---

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/oai-manager.git
cd oai-manager
bash install.sh
bash run.sh
```

Open **http://localhost:3000** in your browser.

After the stack is running:

1. Go to the **gNB** page, select RFSIM, click Start
2. Go to the **UE** page, enter an IMSI, click Start
3. Go to **Metrics**, click Discover UE IP, run the iperf command shown
4. Go to **xApp / Slice**, apply HIGH or LOW to change PRB allocation
5. Watch the throughput chart respond in real time

---

## Network Slicing

Slices are controlled via FlexRIC `SLICE_SM_V0` using the STATIC algorithm.
The xApp binary connects to the nearRT-RIC over E2AP, sends a control message,
and receives an acknowledgment in approximately 6 seconds.

| Slice | PRB allocation | pos_low | pos_high |
|-------|---------------|---------|----------|
| HIGH  | ~80%          | 0       | 10       |
| LOW   | ~25%          | 0       | 3        |

To see the effect, run iperf3 traffic through the UE tunnel while switching slices.
The Metrics page throughput chart updates every second.

---

## PCAP Capture

Captures are saved to `~/oai-manager/captures/` and available for download
directly from the browser.

| Interface   | Traffic captured |
|-------------|-----------------|
| demo-oai    | GTP-U, GTP-C, NAS, SBI (HTTP/2), SCTP |
| oaitun_ue1  | UE PDU session user plane |
| lo          | E2AP between gNB and nearRT-RIC |
| any         | All interfaces |

Recommended Wireshark display filters: `gtp`, `nas-5gs`, `http2`, `sctp`, `e2ap`

---

## Project Structure

```
oai-manager/
├── install.sh              # One-time setup
├── run.sh                  # Start the full stack
├── stop.sh                 # Stop everything cleanly
├── CLAUDE.md               # Instructions for Claude Code
├── backend/                # FastAPI — port 8000
│   ├── main.py
│   └── routers/
│       ├── core.py
│       ├── gnb.py
│       ├── ue.py
│       ├── metrics.py
│       ├── ric.py
│       ├── pcap.py
│       └── config.py
├── frontend/               # React + Vite — port 3000
│   └── src/
│       └── pages/
│           ├── DashboardPage.jsx
│           ├── CorePage.jsx
│           ├── GnbPage.jsx
│           ├── UEPage.jsx
│           ├── MetricsPage.jsx
│           ├── XAppPage.jsx
│           ├── PcapPage.jsx
│           └── ConfigPage.jsx
├── xapp/                   # Slice control — port 7000
│   ├── xapp_server.py
│   └── xapp_slice_ctrl.c
└── scripts/
    └── kill_oai
```

---

## Architecture

```
Browser (port 3000)
        |
        | HTTP + WebSocket
        v
FastAPI Backend (port 8000)
   |          |          |
   v          v          v
Docker     nr-softmodem  xApp Server (port 7000)
(5G Core)  (gNB/UE)          |
                              v
                      xapp_slice_ctrl (C binary)
                              |
                              v
                      nearRT-RIC (FlexRIC)
                              |
                              v
                      gNB E2 Agent (SLICE_SM_V0)
```

---

## Technical Notes

**Metrics parsing** — the backend scans the full gNB log buffer every second.
MAC counters are cumulative so the latest line per UE always wins.
Regex: `UE\s+(\S+):\s+MAC:\s+TX\s+(\d+)\s+RX\s+(\d+)\s+bytes`

**E2 round-trip** — the C xApp takes approximately 6 seconds to subscribe,
send the control message, receive the ACK, and exit cleanly.

**gNB must start via UI** — the metrics chart only shows data when gNB is
launched through OAI Manager. The backend must own the process to read its logs.

**Process safety** — `/usr/local/bin/kill_oai` is a whitelist wrapper that
only accepts `nr-softmodem` and `nr-uesoftmodem` as valid targets.

**Vite proxy** — all browser API calls go through `/api` to port 8000
and `/xapp` to port 7000 to avoid CORS issues during development.

---

## License

Apache 2.0

Built on OpenAirInterface, FlexRIC, React, and FastAPI.
