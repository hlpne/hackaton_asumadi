"""Regenerate the same synthetic catalog for memory mode and PostgreSQL."""
import json
from pathlib import Path

root = Path(__file__).resolve().parents[2]
data = {"routes": [], "stops": [], "route_stops": []}
for route_index, (route_id, color) in enumerate((("demo-17", "#24528a"), ("demo-39", "#c5404c"), ("demo-7", "#1e7568"))):
    data["routes"].append({"id": route_id, "name": f"Демо-маршрут {route_id[5:]}", "color": color})
    for index in range(8):
        stop_id = f"{route_id}-s{index + 1:02}"
        data["stops"].append({
            "id": stop_id, "name": f"Демо-остановка {route_index * 8 + index + 1:02}",
            "lat": round(55.72 + route_index * .035 + index * .003, 6),
            "lon": round(37.55 + route_index * .04 + index * .006, 6),
        })
        for direction in (0, 1):
            data["route_stops"].append({"route_id": route_id, "stop_id": stop_id, "sequence": index if direction == 0 else 7 - index, "direction_id": direction})
(root / "mock_data").mkdir(exist_ok=True)
(root / "mock_data/catalog.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sql_literal(value):
    return "'" + value.replace("'", "''") + "'" if isinstance(value, str) else str(value)


statements = ["-- Generated from the synthetic catalog; not real tram routes.", "BEGIN;"]
for table, rows in data.items():
    columns = list(rows[0])
    statements.append(f"INSERT INTO {table} ({', '.join(columns)}) VALUES")
    statements.append(",\n".join("(" + ", ".join(sql_literal(row[column]) for column in columns) + ")" for row in rows))
    conflict = {"routes": "id", "stops": "id", "route_stops": "route_id, direction_id, sequence"}[table]
    key_columns = {column.strip() for column in conflict.split(",")}
    updates = ", ".join(f"{column}=EXCLUDED.{column}" for column in columns if column not in key_columns)
    statements.append(f"ON CONFLICT ({conflict}) DO UPDATE SET {updates};")
statements.append("COMMIT;")
(root / "db/seed/002_demo.sql").write_text("\n".join(statements) + "\n", encoding="utf-8")
print("Generated catalog.json and 002_demo.sql: 3 routes, 24 stops, 48 route-stop links.")
