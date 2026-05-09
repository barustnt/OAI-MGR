import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import core, gnb, config, metrics, ue, ric, pcap

app = FastAPI(
    title="OAI Manager API",
    description="Web interface backend for OpenAirInterface 5G Core and gNB management",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(core.router,    prefix="/core",    tags=["Core Network"])
app.include_router(ric.router,     prefix="/ric",     tags=["Near-RT RIC (FlexRIC)"])
app.include_router(gnb.router,     prefix="/gnb",     tags=["gNB"])
app.include_router(ue.router,      prefix="/ue",      tags=["UE (RFSIM)"])
app.include_router(config.router,  prefix="/config",  tags=["Config Files"])
app.include_router(pcap.router,    prefix="/pcap",    tags=["PCAP"])
app.include_router(metrics.router, prefix="/metrics", tags=["Metrics"])

@app.on_event("startup")
async def startup():
    asyncio.create_task(metrics.collect_gnb_metrics())
    asyncio.create_task(metrics.collect_amf_metrics())

@app.get("/")
def root():
    return {"status": "OAI Manager API running", "version": "1.0.0"}
