"""Import the bundled tram schedule or rebuild directly from data.mos.ru JSON.

The import is deterministic and replaces only the four ``transit_*`` tables.
"""

from __future__ import annotations

import argparse
from datetime import datetime
import gzip
from json import JSONDecodeError, JSONDecoder
import json
from math import asin, cos, radians, sin, sqrt
import os
from pathlib import Path
import re
from time import sleep
from typing import Iterator

import psycopg


DATASET_FILES = {
    "stop_times": "60661",
    "stops": "60662",
    "routes": "60664",
    "calendar": "60666",
}


def json_items(path: Path) -> Iterator[dict]:
    """Stream objects from one top-level JSON array without loading it into RAM."""
    decoder = JSONDecoder()
    with path.open(encoding="utf-8-sig") as stream:
        buffer = ""
        position = 0
        eof = False
        while True:
            if position > 1_000_000:
                buffer = buffer[position:]
                position = 0
            while position >= len(buffer) and not eof:
                chunk = stream.read(4 * 1024 * 1024)
                if chunk:
                    buffer += chunk
                else:
                    eof = True
            while position < len(buffer) and (buffer[position].isspace() or buffer[position] in "[,]"):
                position += 1
            if position < len(buffer) and buffer[position] == "]":
                return
            if position >= len(buffer):
                if eof:
                    return
                continue
            try:
                item, position = decoder.raw_decode(buffer, position)
            except JSONDecodeError:
                if eof:
                    raise
                chunk = stream.read(4 * 1024 * 1024)
                if chunk:
                    buffer += chunk
                else:
                    eof = True
                continue
            yield item


def source_files(directory: Path) -> dict[str, Path]:
    result = {}
    for name, dataset in DATASET_FILES.items():
        matches = sorted(directory.glob(f"data-{dataset}*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
        if not matches:
            raise FileNotFoundError(f"Dataset {dataset} JSON not found in {directory}")
        result[name] = matches[0]
    return result


def bundle_items(path: Path) -> Iterator[list]:
    with gzip.open(path, "rt", encoding="utf-8") as stream:
        for line in stream:
            if line.strip():
                yield json.loads(line)


def raw_stop_times(
    path: Path,
    route_codes: dict[str, str],
    service_ids: set[str],
) -> Iterator[tuple[str, str, str, int, int, int, int]]:
    for row in json_items(path):
        trip_id = row["trip_id"]
        parts = trip_id.split("_", 2)
        route_id = route_codes.get(parts[0])
        if route_id is None or len(parts) < 2 or parts[1] not in service_ids:
            continue
        yield (
            route_id, parts[1], trip_id, int(row["stop_id"]), int(row["stop_sequence"]),
            seconds(row["arrival_time"]), seconds(row["departure_time"]),
        )


def bundled_stop_times(path: Path) -> Iterator[tuple[str, str, str, int, int, int, int]]:
    for row in bundle_items(path):
        if row[0] == "stop_time":
            yield row[1], row[2], row[3], int(row[4]), int(row[5]), int(row[6]), int(row[7])


def project_route_id(short_name: str) -> str:
    aliases = {"А": "a", "Т1": "t1", "Т2": "t2", "6к": "6k"}
    return "demo-" + aliases.get(short_name, short_name.lower())


def seconds(value: str) -> int:
    hour, minute, second = map(int, value.split(":"))
    return hour * 3600 + minute * 60 + second


def date(value: str):
    return datetime.strptime(value, "%Y%m%d").date()


def distance_m(left: dict, right: tuple[float, float]) -> float:
    lat1, lon1 = radians(left["lat"]), radians(left["lon"])
    lat2, lon2 = map(radians, right)
    dlat, dlon = lat2 - lat1, lon2 - lon1
    value = sin(dlat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(dlon / 2) ** 2
    return 6_371_000 * 2 * asin(sqrt(value))


def normalized_name(value: str) -> str:
    return re.sub(r"[^0-9a-zа-я]+", "", value.casefold().replace("ё", "е"))


def connection_parameters() -> dict:
    return {
        "host": os.getenv("DB_HOST", "127.0.0.1"),
        "port": int(os.getenv("DB_PORT", "55432")),
        "dbname": os.getenv("POSTGRES_DB", "transport"),
        "user": os.getenv("POSTGRES_USER", "transport"),
        "password": os.getenv("POSTGRES_PASSWORD", "transport_local_only"),
        "connect_timeout": 10,
    }


def connect_with_retry(*, autocommit: bool = False, attempts: int = 30):
    """Wait through the short PostgreSQL restart after first-volume initialization."""
    for attempt in range(1, attempts + 1):
        try:
            return psycopg.connect(**connection_parameters(), autocommit=autocommit)
        except psycopg.OperationalError:
            if attempt == attempts:
                raise
            print(
                f"Database is not ready; retrying connection ({attempt}/{attempts})",
                flush=True,
            )
            sleep(1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path)
    parser.add_argument(
        "--bundle",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "mock_data" / "tram_schedule.jsonl.gz",
    )
    parser.add_argument(
        "--catalog",
        type=Path,
        default=Path(__file__).resolve().parents[2] / "mock_data" / "catalog.json",
    )
    parser.add_argument(
        "--migration",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "migrations" / "002_transit_schedule.sql",
    )
    parser.add_argument(
        "--if-empty",
        action="store_true",
        help="Skip the bundled import when transit stop times are already populated.",
    )
    args = parser.parse_args()

    # Docker volumes outlive images, so always apply the idempotent migration
    # before deciding whether the bundled schedule still needs importing.
    with connect_with_retry(autocommit=True) as migration_connection:
        migration_sql = "\n".join(
            line for line in args.migration.read_text(encoding="utf-8").splitlines()
            if line.strip() not in {"BEGIN;", "COMMIT;"}
        )
        for statement in migration_sql.split(";"):
            statement = statement.strip()
            if statement:
                migration_connection.execute(statement)
        if args.if_empty:
            populated = migration_connection.execute(
                "SELECT EXISTS (SELECT 1 FROM transit_stop_times LIMIT 1)"
            ).fetchone()[0]
            if populated:
                print("SCHEDULE_IMPORT_SKIPPED: transit schedule is already populated", flush=True)
                return

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    if args.source_dir is not None:
        files = source_files(args.source_dir)
        route_rows = json.loads(files["routes"].read_text(encoding="utf-8-sig"))
        route_codes = {
            str(row["route_id"]): project_route_id(row["route_short_name"])
            for row in route_rows
            if row["route_type"] == 0
        }
        calendar_rows = json.loads(files["calendar"].read_text(encoding="utf-8-sig"))
        service_ids = {str(row["service_id"]) for row in calendar_rows}
        stop_rows = json.loads(files["stops"].read_text(encoding="utf-8-sig"))
        official_stops = {
            int(row["stop_id"]): (
                row["stop_name"],
                row["geodata_center"]["coordinates"][1],
                row["geodata_center"]["coordinates"][0],
            )
            for row in stop_rows
            if row.get("geodata_center")
        }
        stop_time_rows = raw_stop_times(files["stop_times"], route_codes, service_ids)
        source_name = str(args.source_dir)
    else:
        if not args.bundle.is_file():
            raise FileNotFoundError(f"Bundled tram schedule not found: {args.bundle}")
        route_codes = {}
        calendar_rows = []
        official_stops = {}
        for row in bundle_items(args.bundle):
            if row[0] == "route":
                route_codes[str(row[1])] = row[2]
            elif row[0] == "calendar":
                calendar_rows.append({
                    "service_id": row[1], "monday": row[2], "tuesday": row[3],
                    "wednesday": row[4], "thursday": row[5], "friday": row[6],
                    "saturday": row[7], "sunday": row[8], "start_date": row[9], "end_date": row[10],
                })
            elif row[0] == "stop":
                official_stops[int(row[1])] = (row[2], float(row[3]), float(row[4]))
        stop_time_rows = bundled_stop_times(args.bundle)
        source_name = str(args.bundle)

    if len(route_codes) != 36:
        raise ValueError(f"Expected 36 tram routes, got {len(route_codes)}")
    service_ids = {str(row["service_id"]) for row in calendar_rows}

    used_by_route: dict[str, set[int]] = {route_id: set() for route_id in route_codes.values()}
    imported = 0
    scanned = 0
    with connect_with_retry() as connection:
        with connection.cursor() as cursor:
            cursor.execute("SET statement_timeout = 0")
            cursor.execute(
                "TRUNCATE transit_stop_map, transit_stop_times, transit_stops, transit_calendars"
            )
            with cursor.copy(
                "COPY transit_calendars (service_id, monday, tuesday, wednesday, thursday, friday, "
                "saturday, sunday, start_date, end_date) FROM STDIN"
            ) as copy:
                for row in calendar_rows:
                    copy.write_row((
                        str(row["service_id"]), bool(row["monday"]), bool(row["tuesday"]),
                        bool(row["wednesday"]), bool(row["thursday"]), bool(row["friday"]),
                        bool(row["saturday"]), bool(row["sunday"]), date(row["start_date"]),
                        date(row["end_date"]),
                    ))
            with cursor.copy(
                "COPY transit_stops (external_stop_id, name, lat, lon) FROM STDIN"
            ) as copy:
                for stop_id, (name, lat, lon) in official_stops.items():
                    copy.write_row((stop_id, name, lat, lon))

            with cursor.copy(
                "COPY transit_stop_times (route_id, service_id, trip_id, external_stop_id, "
                "stop_sequence, arrival_seconds, departure_seconds, is_trip_origin) FROM STDIN"
            ) as copy:
                for route_id, service_id, trip_id, stop_id, sequence, arrival, departure in stop_time_rows:
                    scanned += 1
                    if service_id not in service_ids:
                        raise ValueError(f"Calendar {service_id} referenced by {trip_id} is missing")
                    if stop_id not in official_stops:
                        raise ValueError(f"Stop {stop_id} referenced by {trip_id} is missing")
                    copy.write_row((
                        route_id, service_id, trip_id, stop_id, sequence,
                        arrival, departure, sequence == 1,
                    ))
                    used_by_route[route_id].add(stop_id)
                    imported += 1
                    if imported % 100_000 == 0:
                        print(f"Imported {imported:,} tram stop times (scanned {scanned:,})", flush=True)

            stop_by_id = {row["id"]: row for row in catalog["stops"]}
            links_by_route: dict[str, list[dict]] = {}
            for link in catalog["route_stops"]:
                links_by_route.setdefault(link["route_id"], []).append(stop_by_id[link["stop_id"]])
            mapped = 0
            skipped = []
            with cursor.copy(
                "COPY transit_stop_map (route_id, stop_id, external_stop_id, distance_m) FROM STDIN"
            ) as copy:
                for route_id, project_stops in links_by_route.items():
                    candidates = used_by_route.get(route_id, set())
                    if not candidates:
                        raise ValueError(f"No official stop times found for {route_id}")
                    for project_stop in project_stops:
                        same_name = [
                            stop_id for stop_id in candidates
                            if normalized_name(official_stops[stop_id][0]) == normalized_name(project_stop["name"])
                        ]
                        pool = same_name or candidates
                        external_stop_id, distance = min(
                            (
                                (stop_id, distance_m(project_stop, (official_stops[stop_id][1], official_stops[stop_id][2])))
                                for stop_id in pool
                            ),
                            key=lambda pair: pair[1],
                        )
                        if not same_name and distance > 100:
                            skipped.append(f"{route_id}/{project_stop['name']} ({distance:.1f} m)")
                            continue
                        copy.write_row((route_id, project_stop["id"], external_stop_id, distance))
                        mapped += 1
            cursor.execute("ANALYZE transit_calendars")
            cursor.execute("ANALYZE transit_stops")
            cursor.execute("ANALYZE transit_stop_times")
            cursor.execute("ANALYZE transit_stop_map")
    print(
        f"SCHEDULE_IMPORT_OK: {len(route_codes)} routes, {len(calendar_rows)} calendars, "
        f"{imported} tram stop times, {mapped} stop mappings, {len(skipped)} skipped; source={source_name}",
        flush=True,
    )
    for item in skipped:
        print(f"WARNING: no trustworthy official stop match for {item}", flush=True)


if __name__ == "__main__":
    main()
