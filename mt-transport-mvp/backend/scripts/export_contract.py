"""Export examples and schemas from actual application code. Run from repo root."""
import json
from pathlib import Path
import sys

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "backend"))

from app.config import Settings
from app.main import create_app
from app.predictors.mock import MockPredictor
from app.schemas import ForecastRequest, ForecastResponse

request_data = {
    "route_id": "demo-17", "stop_id": "demo-17-s01", "horizon": "day",
    "from": "2026-09-26T08:00:00+03:00", "to": "2026-09-26T10:00:00+03:00",
}
request = ForecastRequest.model_validate(request_data)
response_data = MockPredictor().predict(request).model_dump(mode="json")


def dump(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


outputs = {
    "docs/examples/forecast-request.json": request_data,
    "docs/examples/forecast-response.json": response_data,
    "docs/contracts/forecast-request.schema.json": ForecastRequest.model_json_schema(by_alias=True),
    "docs/contracts/forecast-response.schema.json": ForecastResponse.model_json_schema(),
    "docs/openapi.json": create_app(Settings()).openapi(),
}
for name, value in outputs.items():
    target = root / name
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(dump(value), encoding="utf-8")

document = root / "docs/architecture.md"
text = document.read_text(encoding="utf-8")
for marker, value in (("REQUEST", request_data), ("RESPONSE", response_data)):
    left, right = f"<!-- {marker}_EXAMPLE_START -->", f"<!-- {marker}_EXAMPLE_END -->"
    start, end = text.index(left) + len(left), text.index(right)
    text = text[:start] + "\n```json\n" + dump(value) + "```\n" + text[end:]
document.write_text(text, encoding="utf-8")
print("Exported 5 JSON artifacts and refreshed architecture examples.")
