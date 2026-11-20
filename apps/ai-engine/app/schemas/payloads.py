from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class VehicleFeatures(BaseModel):
    vehicle_id: str
    odometer_km: float = 0
    days_since_service: int = 180
    avg_engine_temp: float = 70
    battery_voltage: Optional[float] = None
    open_fault_codes: int = 0

class MaintenanceRequest(BaseModel):
    vehicles: List[VehicleFeatures]

class AnomalyMetric(BaseModel):
    vehicle_id: str
    odometer_km: float = 0
    battery_voltage: Optional[float] = None
    avg_engine_temp: float = 70
    idle_seconds: float = 0

class AnomalyRequest(BaseModel):
    metrics: List[AnomalyMetric]

class ForecastRequest(BaseModel):
    monthly_values: List[float]
    periods: int = 6

class DriverFeatures(BaseModel):
    driver_id: str
    harsh_braking: int = 0
    overspeeding: int = 0
    harsh_acceleration: int = 0
    idling_minutes: float = 0

class DriverRequest(BaseModel):
    drivers: List[DriverFeatures]

class RecommendationRequest(BaseModel):
    maintenance: List[Dict[str, Any]] = []
    anomalies: List[Dict[str, Any]] = []
    drivers: List[Dict[str, Any]] = []