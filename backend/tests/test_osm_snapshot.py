"""Checks for the pinned route geometry used by the demo API."""

import json
from math import hypot
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def test_every_tram_stop_is_near_its_route_track():
    snapshot = json.loads((ROOT / "mock_data/osm_trams.json").read_text(encoding="utf-8"))
    assert len(snapshot["routes"]) == 36
    assert sum(len(direction["stops"]) for route in snapshot["routes"]
               for direction in route["directions"]) == 2132
    for route in snapshot["routes"]:
        assert len(route["directions"]) == 2, route["id"]
        outward, return_trip = route["directions"]
        for left, right in (
            (outward["stops"][0], return_trip["stops"][-1]),
            (outward["stops"][-1], return_trip["stops"][0]),
        ):
            terminal_gap = hypot((left["lon"] - right["lon"]) * 63_000,
                                 (left["lat"] - right["lat"]) * 111_000)
            assert terminal_gap < 400, (route["id"], left["name"], right["name"])
        for direction in route["directions"]:
            track = [point for line in direction["lines"] for point in line]
            assert track, route["id"]
            for stop in direction["stops"]:
                nearest_metres = min(
                    hypot((point[0] - stop["lon"]) * 63_000,
                          (point[1] - stop["lat"]) * 111_000)
                    for point in track
                )
                assert nearest_metres < 100, (route["id"], stop["name"], nearest_metres)
