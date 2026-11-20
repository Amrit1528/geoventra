from fastapi import APIRouter
from app.schemas.payloads import MaintenanceRequest, AnomalyRequest, ForecastRequest, DriverRequest, RecommendationRequest
from app.services.maintenance_service import predict as maint_predict
from app.services.anomaly_service import detect as anomaly_detect
from app.services.forecasting_service import forecast
from app.services.driver_scoring_service import score as driver_score
from app.services.recommendation_service import generate as gen_recs

router = APIRouter()

@router.post("/predictions/maintenance")
def maintenance(req: MaintenanceRequest):
    return {"data": maint_predict([v.model_dump() for v in req.vehicles])}

@router.post("/anomalies")
def anomalies(req: AnomalyRequest):
    return {"data": anomaly_detect([m.model_dump() for m in req.metrics])}

@router.post("/forecasting/fuel")
def fuel(req: ForecastRequest):
    return forecast(req.monthly_values, req.periods)

@router.post("/driver-scoring")
def drivers(req: DriverRequest):
    return {"data": driver_score([d.model_dump() for d in req.drivers])}

@router.post("/recommendations")
def recommendations(req: RecommendationRequest):
    return {"data": gen_recs(req.maintenance, req.anomalies, req.drivers)}