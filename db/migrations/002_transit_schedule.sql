-- Official public-transport calendar and stop times imported from data.mos.ru JSON exports.
BEGIN;

CREATE TABLE IF NOT EXISTS transit_calendars (
    service_id text PRIMARY KEY,
    monday boolean NOT NULL,
    tuesday boolean NOT NULL,
    wednesday boolean NOT NULL,
    thursday boolean NOT NULL,
    friday boolean NOT NULL,
    saturday boolean NOT NULL,
    sunday boolean NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    CHECK (start_date <= end_date)
);

CREATE TABLE IF NOT EXISTS transit_stops (
    external_stop_id bigint PRIMARY KEY,
    name text NOT NULL,
    lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS transit_stop_times (
    route_id text NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    service_id text NOT NULL REFERENCES transit_calendars(service_id) ON DELETE CASCADE,
    trip_id text NOT NULL,
    external_stop_id bigint NOT NULL REFERENCES transit_stops(external_stop_id) ON DELETE CASCADE,
    stop_sequence integer NOT NULL CHECK (stop_sequence >= 0),
    arrival_seconds integer NOT NULL CHECK (arrival_seconds >= 0 AND arrival_seconds < 108000),
    departure_seconds integer NOT NULL CHECK (departure_seconds >= 0 AND departure_seconds < 108000),
    is_trip_origin boolean NOT NULL,
    PRIMARY KEY (trip_id, stop_sequence)
);

CREATE INDEX IF NOT EXISTS transit_stop_times_lookup
    ON transit_stop_times(route_id, service_id, external_stop_id, arrival_seconds);
CREATE INDEX IF NOT EXISTS transit_trip_origins_lookup
    ON transit_stop_times(route_id, service_id, arrival_seconds) WHERE is_trip_origin;

CREATE TABLE IF NOT EXISTS transit_stop_map (
    route_id text NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
    stop_id text NOT NULL REFERENCES stops(id) ON DELETE CASCADE,
    external_stop_id bigint NOT NULL REFERENCES transit_stops(external_stop_id) ON DELETE CASCADE,
    distance_m double precision NOT NULL CHECK (distance_m >= 0),
    PRIMARY KEY (route_id, stop_id)
);

COMMIT;
