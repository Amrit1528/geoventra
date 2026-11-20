import numpy as np

def predict(vehicles):
    results = []
    for v in vehicles:
        vid = v["vehicle_id"]
        odo = float(v.get("odometer_km", 0))
        days_since = int(v.get("days_since_service", 180))
        avg_temp = float(v.get("avg_engine_temp", 70))
        bv = v.get("battery_voltage")
        open_dtcs = int(v.get("open_fault_codes", 0))
        risk = 20.0
        risk += min(40, odo / 5000.0)
        risk += min(25, days_since / 10.0)
        if avg_temp > 95:
            risk += 15
        if bv is not None and bv < 11.5:
            risk += 20
        if open_dtcs > 0:
            risk += 20
        risk = min(100, risk)
        classification = "low" if risk < 40 else "medium" if risk < 70 else "high" if risk < 90 else "critical"
        results.append({
            "vehicle_id": vid,
            "risk_score": round(risk, 2),
            "risk_classification": classification,
            "predicted_maintenance_window_days": int(max(7, 180 - days_since)),
            "contributing_factors": [
                {"factor": "odometer", "value": odo},
                {"factor": "days_since_service", "value": days_since},
                {"factor": "avg_engine_temp", "value": round(avg_temp, 2)},
                {"factor": "battery_voltage", "value": bv},
                {"factor": "open_fault_codes", "value": open_dtcs},
            ],
            "confidence": 0.65,
            "recommended_action": "Schedule inspection" if risk >= 70 else "Routine monitoring",
            "model_version": "rules-ml-1.0",
        })
    return results