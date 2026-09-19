"""Check a running backend directly, bypassing the frontend's local fallback."""

import argparse
import json
from urllib.parse import urlencode
from urllib.request import urlopen


def check_api(base_url: str, expected_model: str, expected_mock: bool) -> None:
    def get(path, params):
        with urlopen(f"{base_url.rstrip('/')}{path}?{urlencode(params)}", timeout=30) as response:
            return json.load(response)

    def require(condition, message):
        if not condition:
            raise RuntimeError(message)

    def metadata(data):
        require(data["model_version"] == expected_model, f"Unexpected model: {data['model_version']}")
        require(data["is_mock"] is expected_mock, "Unexpected is_mock flag")

    for horizon, start, end, count in [
        ("day", "2026-09-26", "2026-09-27", 24),
        ("month", "2028-02-01", "2028-03-01", 29),
        ("year", "2026-09-01", "2027-09-01", 12),
    ]:
        query = {"route_id": "demo-17", "stop_id": "demo-17-s01", "direction_id": 0,
                 "horizon": horizon, "from": start + "T00:00:00+03:00", "to": end + "T00:00:00+03:00"}
        series = get("/forecast", query)
        metadata(series)
        require(len(series["points"]) == count, f"Wrong point count for {horizon}")
        require(series["points"][0]["timestamp"] == query["from"], "Wrong start date")
        snapshot = {"route_id": "demo-17", "direction_id": 0, "horizon": horizon,
                    "timestamp": query["from"], "forecast_origin": query["from"]}
        mapped = get("/forecast/map", snapshot)
        top = get("/forecast/top-overload", snapshot | {"limit": 5})
        metadata(mapped)
        metadata(top)
        require(len(mapped["points"]) == 8 and len(top["items"]) == 5, "Wrong snapshot size")
        point = next(item for item in mapped["points"] if item["stop_id"] == query["stop_id"])
        require(point["predicted_load"] == series["points"][0]["predicted_load"], "Series and map disagree")
        require([item["predicted_load"] for item in top["items"]] == sorted(
            (item["predicted_load"] for item in mapped["points"]), reverse=True,
        )[:5], "Top-N and map disagree")
        print(f"PASS {horizon}: {count} points; forecast/map/top agree; {expected_model}")
    print("MODEL_ADAPTER_OK")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8000")
    parser.add_argument("--expected-model", required=True)
    parser.add_argument("--expected-source", choices=["mock", "real"], default="mock")
    args = parser.parse_args()
    check_api(args.base_url, args.expected_model, args.expected_source == "mock")
