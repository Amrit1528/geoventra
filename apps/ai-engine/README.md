# Geoventra AI Engine

FastAPI-based ML microservice for fleet intelligence.

Run:
```
cd apps/ai-engine
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

NestJS integration: set `AI_ENGINE_URL=http://localhost:8000` in API env. If unavailable, the API falls back to deterministic calculations.