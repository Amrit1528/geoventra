from sqlalchemy import create_engine, text
from app.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)

def run_sql(sql: str, params: dict | None = None):
    with engine.connect() as conn:
        conn.execute(text(f"SET search_path TO {settings.database_schema}, public"))
        result = conn.execute(text(sql), params or {})
        try:
            rows = [dict(r._mapping) for r in result]
        except Exception:
            rows = []
        conn.commit()
        return rows