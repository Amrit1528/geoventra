import numpy as np
from sklearn.ensemble import IsolationForest

def detect(metrics):
    rows = []
    ids = []
    for m in metrics:
        rows.append([
            float(m.get("odometer_km", 0)),
            float(m.get("battery_voltage") if m.get("battery_voltage") is not None else 12.0),
            float(m.get("avg_engine_temp", 70)),
            float(m.get("idle_seconds", 0)),
        ])
        ids.append(m["vehicle_id"])
    if not rows:
        return []
    X = np.array(rows, dtype=float)
    means = X.mean(axis=0)
    stds = X.std(axis=0)
    stds[stds == 0] = 1.0
    Xn = (X - means) / stds
    anomalies = []
    if len(Xn) >= 5:
        model = IsolationForest(contamination=0.1, random_state=42)
        preds = model.fit_predict(Xn)
        scores = model.decision_function(Xn)
        for i, vid in enumerate(ids):
            if preds[i] == -1:
                anomalies.append({"vehicle_id": vid, "anomaly_score": round(float(-scores[i]), 4),
                                 "severity": "high" if -scores[i] > 0.2 else "medium",
                                 "explanation": "Multivariate anomaly detected by IsolationForest", "confidence": 0.7})
    for i, vid in enumerate(ids):
        bt = rows[i][1]
        at = rows[i][2]
        if bt < 11.5:
            anomalies.append({"vehicle_id": vid, "anomaly_score": 0.8, "severity": "high",
                             "explanation": "Battery voltage below 11.5V", "confidence": 0.9})
        if at > 100:
            anomalies.append({"vehicle_id": vid, "anomaly_score": 0.75, "severity": "high",
                             "explanation": "Engine temperature above 100C", "confidence": 0.9})
    best = {}
    for a in anomalies:
        vid = a["vehicle_id"]
        if vid not in best or a["anomaly_score"] > best[vid]["anomaly_score"]:
            best[vid] = a
    return list(best.values())