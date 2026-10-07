from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health")
async def health():
    return {
        "ok": True,
        "env": settings.app_env,
        "folder": settings.yc_folder_id[:6] + "…",
    }
