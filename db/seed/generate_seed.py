"""Regenerate the deterministic demo catalog and PostgreSQL seed."""

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

ROUTES = (
    ("demo-17", "Демо-маршрут 17", "#24528a", 28),
    ("demo-39", "Демо-маршрут 39", "#c5404c", 43),
    ("demo-7", "Демо-маршрут 7", "#1e7568", 35),
)


def hour_value(series_key: str, timestamp: datetime, route_base: float) -> float:
    """Return a stable synthetic load with morning and evening peaks."""
    series_offset = int(sha256(series_key.encode()).hexdigest()[:8], 16) % 17 - 8
    morning_peak = 42 * exp(-((timestamp.hour - 8) / 2.0) ** 2)
    evening_peak = 36 * exp(-((timestamp.hour - 18) / 2.6) ** 2)
    weekend_factor = 0.78 if timestamp.weekday() >= 5 else 1.0
    return round(max(5, (route_base + series_offset + morning_peak + evening_peak) * weekend_factor), 2)


def build_data() -> dict[str, list[dict]]:
    data: dict[str, list[dict]] = {
        "routes": [],
        "stops": [],
        "route_stops": [],
        "forecasts": [],
    }
    for route_index, (route_id, route_name, color, route_base) in enumerate(ROUTES):
        data["routes"].append({"id": route_id, "name": route_name, "color": color})
        route_stop_ids = []
        for stop_index in range(8):
            stop_id = f"{route_id}-s{stop_index + 1:02}"
            route_stop_ids.append(stop_id)
            data["stops"].append({
                "id": stop_id,
                "name": f"Демо-остановка {route_index * 8 + stop_index + 1:02}",
                "lat": round(55.72 + route_index * 0.035 + stop_index * 0.003, 6),
                "lon": round(37.55 + route_index * 0.04 + stop_index * 0.006, 6),
            })
            for direction in (0, 1):
                data["route_stops"].append({
                    "route_id": route_id,
                    "stop_id": stop_id,
                    "sequence": stop_index if direction == 0 else 7 - stop_index,
                    "direction_id": direction,
                })

        series = [(None, f"{route_id}/route")]
        series.extend((stop_id, f"{route_id}/{stop_id}") for stop_id in route_stop_ids)
        for stop_id, series_key in series:
            for hour in range(FORECAST_HOURS):
                timestamp = FORECAST_ORIGIN + timedelta(hours=hour)
                predicted_load = hour_value(series_key, timestamp, route_base)
                data["forecasts"].append({
                    "route_id": route_id,
                    "stop_id": stop_id,
                    "direction_id": None,
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
        "-- Deterministic demo data; not real tram routes or passenger counts.",
        "BEGIN;",
    ]
    for table in ("routes", "stops", "route_stops", "forecasts"):
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
