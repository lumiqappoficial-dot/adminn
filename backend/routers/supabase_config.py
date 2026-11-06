import os
import re

from fastapi import APIRouter, HTTPException

from models.supabase_config import SupabaseConfig

router = APIRouter()


@router.get("/supabase-config", response_model=SupabaseConfig)
async def get_supabase_config():
    """Public Supabase URL + anon key (both are browser-safe by design)."""
    raw = os.environ.get("SUPABASE_URL", "").strip()
    # Keep only the project origin (e.g. https://xxx.supabase.co) even if a path/extra text was pasted.
    match = re.search(r"https?://[^/\s]+", raw)
    url = match.group(0) if match else ""
    key = os.environ.get("SUPABASE_ANON_KEY", "").strip()
    if not url or not key:
        raise HTTPException(status_code=503, detail="Supabase no configurado")
    return SupabaseConfig(url=url, anon_key=key)
