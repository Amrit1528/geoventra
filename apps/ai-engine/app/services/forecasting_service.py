import numpy as np
from sklearn.linear_model import LinearRegression

def forecast(monthly_values, periods=6):
    y = np.array(monthly_values, dtype=float)
    if len(y) < 2:
        return {"history": list(y), "forecast": [], "method": "insufficient_data"}
    X = np.arange(len(y)).reshape(-1, 1)
    model = LinearRegression().fit(X, y)
    future_X = np.arange(len(y), len(y) + periods).reshape(-1, 1)
    preds = model.predict(future_X)
    residuals = y - model.predict(X)
    std = float(np.std(residuals)) if len(residuals) > 1 else 0.0
    forecast = []
    for i, p in enumerate(preds):
        forecast.append({"month_offset": i + 1, "predicted_value": round(float(p), 2),
                        "lower": round(float(p - 1.96 * std), 2), "upper": round(float(p + 1.96 * std), 2)})
    return {"history": [float(x) for x in y], "forecast": forecast, "method": "linear_regression"}