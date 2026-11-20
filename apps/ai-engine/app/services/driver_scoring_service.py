def score(drivers):
    results = []
    for d in drivers:
        hb = int(d.get("harsh_braking", 0))
        os_ = int(d.get("overspeeding", 0))
        ha = int(d.get("harsh_acceleration", 0))
        idle = float(d.get("idling_minutes", 0))
        penalty = hb * 2 + os_ * 3 + ha * 2 + min(20, idle / 10.0)
        sc = max(0, min(100, 100 - penalty))
        risk = "low" if sc >= 75 else "medium" if sc >= 50 else "high"
        results.append({
            "driver_id": d["driver_id"],
            "safety_score": round(sc, 2),
            "risk_classification": risk,
            "factors": {"harsh_braking": hb, "overspeeding": os_, "harsh_acceleration": ha, "idling_minutes": idle},
            "recommendations": ["Reduce harsh events", "Minimize idle time"] if risk != "low" else ["Maintain safe driving"],
        })
    results.sort(key=lambda x: x["safety_score"], reverse=True)
    for i, r in enumerate(results):
        r["rank"] = i + 1
    return results