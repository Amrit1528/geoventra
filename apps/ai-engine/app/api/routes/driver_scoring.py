from fastapi import APIRouter, Query
from app.services.driver_scoring_service import score

router = APIRouter()

@router.get("/driver-scoring")
def driver_scoring(org_id: str = Query(..., alias="organisation_id")):
    return {"data": score(org_id)}