"""Small catalog boundary; raw telemetry and model training are separate concerns."""

import json
from typing import Protocol

import psycopg
from psycopg.rows import dict_row

from app.config import ROOT, database_parameters
from app.schemas import Route, RouteStop


class Catalog(Protocol):
    def routes(self) -> list[Route]: ...
    def stops(self, route_id: str) -> list[RouteStop]: ...
    def ping(self) -> str: ...


class MemoryCatalog:
    def __init__(self) -> None:
        self.data = json.loads((ROOT / "mock_data" / "catalog.json").read_text(encoding="utf-8"))

    def routes(self) -> list[Route]:
        return [Route.model_validate(row) for row in self.data["routes"]]

    def stops(self, route_id: str) -> list[RouteStop]:
        stops = {row["id"]: row for row in self.data["stops"]}
        result = [
            RouteStop(**stops[link["stop_id"]], sequence=link["sequence"], direction_id=link["direction_id"])
            for link in self.data["route_stops"] if link["route_id"] == route_id
        ]
        return sorted(result, key=lambda item: (item.direction_id, item.sequence))

    def ping(self) -> str:
        return "disabled"


class PostgresCatalog:
    def _read(self, query: str, parameters: tuple = ()) -> list[dict]:
        with psycopg.connect(**database_parameters(), row_factory=dict_row) as connection:
            return connection.execute(query, parameters).fetchall()

    def routes(self) -> list[Route]:
        return [Route.model_validate(row) for row in self._read("SELECT id, name, color FROM routes ORDER BY id")]

    def stops(self, route_id: str) -> list[RouteStop]:
        rows = self._read(
            "SELECT s.id, s.name, s.lat, s.lon, rs.sequence, rs.direction_id "
            "FROM route_stops rs JOIN stops s ON s.id = rs.stop_id "
            "WHERE rs.route_id = %s ORDER BY rs.direction_id, rs.sequence", (route_id,),
        )
        return [RouteStop.model_validate(row) for row in rows]

    def ping(self) -> str:
        self._read("SELECT 1")
        return "ok"
