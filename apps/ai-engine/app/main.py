from fastapi import FastAPI
from app.api.routes.health import router as health_router
from app.api.routes.predictions import router as predictions_router

app = FastAPI(title="Geoventra AI Engine", version="1.0.0")

app.include_router(health_router)
app.include_router(predictions_router, prefix="/api/v1")