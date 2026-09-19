"""Build a compact, Git-friendly tram-only schedule snapshot from data.mos.ru JSON."""

from __future__ import annotations

import argparse
import gzip
import io
import json
from json import JSONDecodeError, JSONDecoder
from pathlib import Path
from typing import Iterator


DATASET_FILES = {"stop_times": "60661", "stops": "60662", "routes": "60664", "calendar": "60666"}


def json_items(path: Path) -> Iterator[dict]:
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


def sources(directory: Path) -> dict[str, Path]:
    result = {}
    for name, dataset in DATASET_FILES.items():
        matches = sorted(directory.glob(f"data-{dataset}*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
        if not matches:
            raise FileNotFoundError(f"Dataset {dataset} JSON not found in {directory}")
        result[name] = matches[0]
    return result


def project_route_id(short_name: str) -> str:
    aliases = {"А": "a", "Т1": "t1", "Т2": "t2", "6к": "6k"}
    return "demo-" + aliases.get(short_name, short_name.lower())


def seconds(value: str) -> int:
    hour, minute, second = map(int, value.split(":"))
    return hour * 3600 + minute * 60 + second


def write_record(stream, record: list) -> None:
    stream.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")))
    stream.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    files = sources(args.source_dir)
    routes = json.loads(files["routes"].read_text(encoding="utf-8-sig"))
    route_codes = {
        str(row["route_id"]): project_route_id(row["route_short_name"])
        for row in routes if row["route_type"] == 0
    }
    calendars = json.loads(files["calendar"].read_text(encoding="utf-8-sig"))
    service_ids = {str(row["service_id"]) for row in calendars}
    stops = json.loads(files["stops"].read_text(encoding="utf-8-sig"))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    used_stops = set()
    with args.output.open("wb") as raw_output:
        with gzip.GzipFile(filename="", mode="wb", fileobj=raw_output, compresslevel=9, mtime=0) as compressed:
            with io.TextIOWrapper(compressed, encoding="utf-8") as output:
                write_record(output, ["meta", 1, "data.mos.ru", "60661/60662/60664/60666", "tram-only"])
                for row in routes:
                    code = str(row["route_id"])
                    if code in route_codes:
                        write_record(output, ["route", code, route_codes[code], row["route_short_name"], row["route_long_name"]])
                for row in calendars:
                    write_record(output, [
                        "calendar", str(row["service_id"]), row["monday"], row["tuesday"], row["wednesday"],
                        row["thursday"], row["friday"], row["saturday"], row["sunday"],
                        row["start_date"], row["end_date"],
                    ])
                for row in stops:
                    center = row.get("geodata_center")
                    if center:
                        lon, lat = center["coordinates"]
                        write_record(output, ["stop", int(row["stop_id"]), row["stop_name"], lat, lon])
                for row in json_items(files["stop_times"]):
                    trip_id = row["trip_id"]
                    parts = trip_id.split("_", 2)
                    route_id = route_codes.get(parts[0])
                    if route_id is None or len(parts) < 2 or parts[1] not in service_ids:
                        continue
                    stop_id = int(row["stop_id"])
                    used_stops.add(stop_id)
                    write_record(output, [
                        "stop_time", route_id, parts[1], trip_id, stop_id, int(row["stop_sequence"]),
                        seconds(row["arrival_time"]), seconds(row["departure_time"]),
                    ])
                    count += 1
    print(f"SCHEDULE_BUNDLE_OK: {count} stop times, {len(used_stops)} stops, {args.output}")


if __name__ == "__main__":
    main()
