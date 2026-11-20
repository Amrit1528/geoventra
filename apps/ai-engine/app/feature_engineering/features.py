from app.repositories.db import run_sql

def vehicles(org_id: str):
    return run_sql("SELECT * FROM vehicles WHERE organisation_id = :org", {"org": org_id})

def trips(org_id: str, days: int = 90):
    return run_sql(
        "SELECT * FROM trips WHERE organisation_id = :org AND started_at >= now() - (:d || ' days')::interval",
        {"org": org_id, "d": str(days)},
    )

def refuels(org_id: str, days: int = 90):
    return run_sql(
        "SELECT * FROM refuelling_events WHERE organisation_id = :org AND recorded_at >= now() - (:d || ' days')::interval",
        {"org": org_id, "d": str(days)},
    )

def maintenance(org_id: str):
    return run_sql("SELECT * FROM maintenance_records WHERE organisation_id = :org", {"org": org_id})

def telemetry(org_id: str, days: int = 30):
    return run_sql(
        "SELECT * FROM engine_telemetry_readings WHERE organisation_id = :org AND recorded_at >= now() - (:d || ' days')::interval",
        {"org": org_id, "d": str(days)},
    )

def driver_behavior(org_id: str):
    return run_sql("SELECT * FROM driver_behavior WHERE organisation_id = :org", {"org": org_id})