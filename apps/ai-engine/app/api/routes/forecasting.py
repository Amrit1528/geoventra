from fastapi import APIRouter, Query
from app.services.forecasting_service import forecast

router = APIRouter()

@router.get("/forecasting/fuel")
def fuel(org_id: str = Query(..., alias="organisation_id"), months: int = 6):
    return forecast(org_id, months)