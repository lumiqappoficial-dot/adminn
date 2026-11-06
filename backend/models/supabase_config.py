from pydantic import BaseModel


class SupabaseConfig(BaseModel):
    url: str
    anon_key: str
