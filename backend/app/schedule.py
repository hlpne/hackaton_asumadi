"""Read official timetable instants without exposing source-specific rows to the API."""

from datetime import date, datetime, time, timedelta

import psycopg

from app.config import Settings
from app.schemas import ForecastRequest, MOSCOW


WEEKDAY_COLUMNS = (
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
)


class PostgresSchedule:
    def __init__(self, settings: Settings) -> None:
        self.connection_parameters = settings.database_parameters()

    @staticmethod
    def _service_days(start: datetime, end: datetime) -> list[date]:
        current = start.date() - timedelta(days=1)
        result = []
        while current <= end.date():
            result.append(current)
            current += timedelta(days=1)
        return result

    def arrivals(self, request: ForecastRequest) -> list[datetime]:
        timestamps: set[datetime] = set()
        with psycopg.connect(**self.connection_parameters) as connection:
            with connection.cursor() as cursor:
                external_stop_id = None
                if request.stop_id is not None:
                    row = cursor.execute(
                        "SELECT external_stop_id FROM transit_stop_map WHERE route_id = %s AND stop_id = %s",
                        (request.route_id, request.stop_id),
                    ).fetchone()
                    if row is None:
                        return []
                    external_stop_id = row[0]

                for service_day in self._service_days(request.start, request.end):
                    weekday = WEEKDAY_COLUMNS[service_day.weekday()]
                    midnight = datetime.combine(service_day, time(), tzinfo=MOSCOW)
                    lower = max(0, int((request.start - midnight).total_seconds()))
                    upper = min(108_000, int((request.end - midnight).total_seconds()))
                    if upper <= lower:
                        continue
                    stop_clause = "st.is_trip_origin" if external_stop_id is None else "st.external_stop_id = %s"
                    parameters: list = [request.route_id, service_day, service_day, lower, upper]
                    if external_stop_id is not None:
                        parameters.append(external_stop_id)
                    rows = cursor.execute(
                        "SELECT DISTINCT (st.arrival_seconds / 60) * 60 AS arrival_seconds "
                        "FROM transit_stop_times st JOIN transit_calendars c ON c.service_id = st.service_id "
                        "WHERE st.route_id = %s AND c.start_date <= %s AND c.end_date >= %s "
                        f"AND c.{weekday} AND st.arrival_seconds >= %s AND st.arrival_seconds < %s "
                        f"AND {stop_clause} ORDER BY arrival_seconds",
                        tuple(parameters),
                    ).fetchall()
                    timestamps.update(midnight + timedelta(seconds=row[0]) for row in rows)
        return sorted(value for value in timestamps if request.start <= value < request.end)
