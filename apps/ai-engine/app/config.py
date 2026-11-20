import os
from pydantic import BaseModel

class Settings(BaseModel):
    database_url: str = os.getenv("DATABASE_URL", "postgresql://geoventra@localhost:5432/geoventra")
    database_schema: str = os.getenv("DATABASE_SCHEMA", "geoventra")
    ai_engine_host: str = os.getenv("AI_ENGINE_HOST", "0.0.0.0")
    ai_engine_port: int = int(os.getenv("AI_ENGINE_PORT", "8000"))
    log_level: str = os.getenv("LOG_LEVEL", "INFO")

settings = Settings()