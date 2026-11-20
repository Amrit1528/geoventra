def generate(maintenance, anomalies, drivers):
    recs = []
    for m in maintenance or []:
        if m.get("risk_score", 0) >= 70:
            recs.append({"type": "maintenance", "priority": "high", "title": m.get("recommended_action", "Service"),
                        "evidence": f"Risk score {m.get('risk_score')}", "vehicle_id": m.get("vehicle_id")})
    for a in anomalies or []:
        recs.append({"type": "anomaly", "priority": a.get("severity", "medium"), "title": a.get("explanation", "Anomaly"),
                    "evidence": f"Anomaly score {a.get('anomaly_score')}", "vehicle_id": a.get("vehicle_id")})
    for d in drivers or []:
        if d.get("risk_classification") == "high":
            recs.append({"type": "driver", "priority": "high", "title": "Driver coaching recommended",
                        "evidence": f"Safety score {d.get('safety_score')}", "driver_id": d.get("driver_id")})
    return recs