from fastapi import APIRouter, Query
from app.services.maintenance_service import predict as maint_predict

router = APIRouter()

@router.get("/maintenance")
def maintenance(org_id: str = Query(..., alias="organisation_id")):
    return {"data": maint_predict(org_id)}