"""Regenerate the deterministic OSM geography and mock forecast seed."""

import json
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from math import exp
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MOSCOW = timezone(timedelta(hours=3))
FORECAST_ORIGIN = datetime(2026, 9, 26, tzinfo=MOSCOW)
FORECAST_HOURS = 24
MODEL_VERSION = "mock-seed-v1"

ROUTE_BASES = {"demo-17": 28, "demo-39": 43, "demo-7": 35}
SERVICE_HOURS = json.loads((ROOT / "mock_data" / "service_hours.json").read_text(encoding="utf-8"))


def in_demo_service(series_key: str, timestamp: datetime) -> bool:
    """Apply the same illustrative service window as the API mock predictor."""
    route_id, _, stop_id = series_key.partition("/")
    stop_id = stop_id.split("/", 1)[0]
    window = (SERVICE_HOURS["stops"].get(stop_id)
              or SERVICE_HOURS["routes"].get(route_id)
              or SERVICE_HOURS["default"])
    start = int(window["start"][:2]) * 60 + int(window["start"][3:])
    end = int(window["end"][:2]) * 60 + int(window["end"][3:])
    minute = timestamp.hour * 60 + timestamp.minute
    return start <= minute < end if start < end else minute >= start or minute < end


def route_base(route_id: str) -> int:
    """Keep existing demo series stable and assign other routes stable load bands."""
    return ROUTE_BASES.get(
        route_id,
        27 + int(sha256(route_id.encode("utf-8")).hexdigest()[:8], 16) % 23,
    )


def hour_value(series_key: str, timestamp: datetime, route_base: float) -> float:
    """Return a stable synthetic load with morning and evening peaks."""
    if not in_demo_service(series_key, timestamp):
        return 0.0
    series_offset = int(sha256(series_key.encode()).hexdigest()[:8], 16) % 17 - 8
    morning_peak = 42 * exp(-((timestamp.hour - 8) / 2.0) ** 2)
    evening_peak = 36 * exp(-((timestamp.hour - 18) / 2.6) ** 2)
    weekend_factor = 0.78 if timestamp.weekday() >= 5 else 1.0
    return round(max(5, (route_base + series_offset + morning_peak + evening_peak) * weekend_factor), 2)


def build_data() -> dict[str, list[dict]]:
    geography = json.loads((ROOT / "mock_data" / "osm_trams.json").read_text(encoding="utf-8"))
    data: dict[str, list[dict]] = {
        "routes": [],
        "stops": [],
        "route_stops": [],
        "model_runs": [{
            "model_version": MODEL_VERSION,
            "is_mock": True,
            "value_unit": "demo_index",
            "aggregation": "demo_mean",
            "interval_level": None,
        }],
        "forecasts": [],
    }
    for route in geography["routes"]:
        route_id = route["id"]
        base_load = route_base(route_id)
        data["routes"].append({"id": route_id, "name": route["name"], "color": route["color"]})
        route_stop_ids: list[tuple[str, int]] = []
        for direction, geometry in enumerate(route["directions"]):
            for stop_index, source_stop in enumerate(geometry["stops"]):
                suffix = f"s{stop_index + 1:02}" if direction == 0 else f"r{stop_index + 1:02}"
                stop_id = f"{route_id}-{suffix}"
                route_stop_ids.append((stop_id, direction))
                data["stops"].append({
                    "id": stop_id,
                    "name": source_stop["name"],
                    "lat": source_stop["lat"],
                    "lon": source_stop["lon"],
                })
                data["route_stops"].append({
                    "route_id": route_id,
                    "stop_id": stop_id,
                    "sequence": stop_index,
                    "direction_id": direction,
                })

        series = [(None, None, f"{route_id}/route")]
        series.extend(
            (stop_id, direction_id, f"{route_id}/{stop_id}")
            for stop_id, direction_id in route_stop_ids
        )
        for stop_id, direction_id, series_key in series:
            for hour in range(FORECAST_HOURS):
                timestamp = FORECAST_ORIGIN + timedelta(hours=hour)
                predicted_load = hour_value(series_key, timestamp, base_load)
                data["forecasts"].append({
                    "route_id": route_id,
                    "stop_id": stop_id,
                    "direction_id": direction_id,
                    "timestamp": timestamp,
                    "horizon": "day",
                    "resolution": "PT1H",
                    "forecast_origin": FORECAST_ORIGIN,
                    "predicted_load": predicted_load,
                    "lower_bound": round(predicted_load * 0.85, 2),
                    "upper_bound": round(predicted_load * 1.15, 2),
                    "value_unit": "demo_index",
                    "aggregation": "demo_mean",
                    "is_mock": True,
                    "model_version": MODEL_VERSION,
                    "interval_level": None,
                })
    return data


def sql_literal(value: object) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, datetime):
        return "'" + value.isoformat() + "'"
    if isinstance(value, str):
        return "'" + value.replace("'", "''") + "'"
    return str(value)


def insert_statement(table: str, rows: list[dict]) -> str:
    columns = list(rows[0])
    key_columns = {
        "routes": ("id",),
        "stops": ("id",),
        "route_stops": ("route_id", "direction_id", "sequence"),
        "model_runs": ("model_version",),
        "forecasts": (
            "route_id", "stop_id", "direction_id", "timestamp",
            "horizon", "forecast_origin", "model_version",
        ),
    }[table]
    values = ",\n".join(
        "(" + ", ".join(sql_literal(row[column]) for column in columns) + ")"
        for row in rows
    )
    updates = ", ".join(
        f"{column}=EXCLUDED.{column}" for column in columns if column not in key_columns
    )
    return (
        f"INSERT INTO {table} ({', '.join(columns)}) VALUES\n{values}\n"
        f"ON CONFLICT ({', '.join(key_columns)}) DO UPDATE SET {updates};"
    )


def main() -> None:
    data = build_data()
    catalog = {key: data[key] for key in ("routes", "stops", "route_stops")}
    (ROOT / "mock_data").mkdir(exist_ok=True)
    (ROOT / "mock_data/catalog.json").write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    statements = [
        "-- OSM geography snapshot with deterministic synthetic load forecasts; not real passenger counts.",
        "BEGIN;",
    ]
    for table in ("routes", "stops", "route_stops", "model_runs", "forecasts"):
        statements.append(insert_statement(table, data[table]))
    statements.append("COMMIT;")
    (ROOT / "db/seed/002_demo.sql").write_text(
        "\n".join(statements) + "\n",
        encoding="utf-8",
        newline="\n",
    )
    print(
        "Generated catalog.json and 002_demo.sql: "
        f"{len(data['routes'])} routes, {len(data['stops'])} stops, "
        f"{len(data['route_stops'])} route-stop links, {len(data['forecasts'])} forecasts."
    )


if __name__ == "__main__":
    main()
