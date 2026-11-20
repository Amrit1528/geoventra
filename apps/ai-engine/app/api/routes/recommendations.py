from fastapi import APIRouter, Query
from app.services.recommendation_service import generate

router = APIRouter()

@router.get("/recommendations")
def recommendations(org_id: str = Query(..., alias="organisation_id")):
    return {"data": generate(org_id)}