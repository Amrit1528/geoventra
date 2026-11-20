from fastapi import APIRouter, Query
from app.services.anomaly_service import detect

router = APIRouter()

@router.get("/anomalies")
def anomalies(org_id: str = Query(..., alias="organisation_id")):
    return {"data": detect(org_id)}