import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

def _p(*parts) -> str:
    return os.path.expanduser(os.path.join("~", *parts))

# Allowed config file paths (for security)
ALLOWED_CONFIG_PATHS = {
    "gnb":           _p("openairinterface5g/targets/PROJECTS/GENERIC-NR-5GC/CONF/gnb.sa.band78.fr1.106PRB.usrpb210.conf"),
    "amf":           _p("oai-cn5g/config/amf/config.yaml"),
    "smf":           _p("oai-cn5g/config/smf/config.yaml"),
    "nrf":           _p("oai-cn5g/config/nrf/config.yaml"),
    "udr":           _p("oai-cn5g/config/udr/config.yaml"),
    "udm":           _p("oai-cn5g/config/udm/config.yaml"),
    "ausf":          _p("oai-cn5g/config/ausf/config.yaml"),
    "upf":           _p("oai-cn5g/config/upf/config.yaml"),
    "database":      _p("oai-cn5g/database/oai_db.sql"),
    "docker-compose":_p("oai-cn5g/docker-compose.yaml"),
}


class WriteConfigRequest(BaseModel):
    key: str
    content: str


@router.get("/list")
def list_configs():
    """List all available config files with their existence status"""
    result = []
    for key, path in ALLOWED_CONFIG_PATHS.items():
        result.append({
            "key": key,
            "path": path,
            "exists": os.path.exists(path),
            "size": os.path.getsize(path) if os.path.exists(path) else 0
        })
    return {"configs": result}


@router.get("/read/{key}")
def read_config(key: str):
    """Read a config file by key"""
    if key not in ALLOWED_CONFIG_PATHS:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

    path = ALLOWED_CONFIG_PATHS[key]
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return {
            "key": key,
            "path": path,
            "content": content
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/write")
def write_config(req: WriteConfigRequest):
    """Write/save a config file"""
    if req.key not in ALLOWED_CONFIG_PATHS:
        raise HTTPException(status_code=404, detail=f"Config key '{req.key}' not found")

    path = ALLOWED_CONFIG_PATHS[req.key]

    try:
        # Backup original
        if os.path.exists(path):
            backup_path = path + ".bak"
            with open(path, "r") as f:
                original = f.read()
            with open(backup_path, "w") as f:
                f.write(original)

        # Write new content
        with open(path, "w", encoding="utf-8") as f:
            f.write(req.content)

        return {
            "status": "saved",
            "key": req.key,
            "path": path,
            "backup": path + ".bak"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/restore/{key}")
def restore_config(key: str):
    """Restore a config file from backup"""
    if key not in ALLOWED_CONFIG_PATHS:
        raise HTTPException(status_code=404, detail=f"Config key '{key}' not found")

    path = ALLOWED_CONFIG_PATHS[key]
    backup_path = path + ".bak"

    if not os.path.exists(backup_path):
        raise HTTPException(status_code=404, detail="No backup found")

    try:
        with open(backup_path, "r") as f:
            backup = f.read()
        with open(path, "w") as f:
            f.write(backup)
        return {"status": "restored", "key": key, "path": path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
