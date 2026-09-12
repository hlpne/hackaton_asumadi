-- Initial product schema for PostgreSQL 16. No raw telemetry tables.
BEGIN;
CREATE TABLE IF NOT EXISTS routes (
    id text PRIMARY KEY,
    name text NOT NULL,
    color text NOT NULL
);
CREATE TABLE IF NOT EXISTS stops (
    id text PRIMARY KEY,
    name text NOT NULL,
    lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
    lon double precision NOT NULL CHECK (lon BETWEEN -180 AND 180)
);
CREATE TABLE IF NOT EXISTS route_stops (
    route_id text NOT NULL REFERENCES routes(id),
    stop_id text NOT NULL REFERENCES stops(id),
    sequence integer NOT NULL CHECK (sequence >= 0),
    direction_id smallint NOT NULL CHECK (direction_id IN (0, 1)),
    PRIMARY KEY (route_id, direction_id, sequence)
);
CREATE INDEX IF NOT EXISTS route_stops_lookup ON route_stops(route_id, stop_id, direction_id);

-- Prepared for subsequent persistence work. /forecast does not write this table yet.
CREATE TABLE IF NOT EXISTS forecasts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_version text NOT NULL DEFAULT '1.0',
    route_id text NOT NULL REFERENCES routes(id),
    stop_id text REFERENCES stops(id),
    direction_id smallint CHECK (direction_id IN (0, 1)),
    timestamp timestamptz NOT NULL,
    horizon text NOT NULL CHECK (horizon IN ('day', 'month', 'year')),
    resolution text NOT NULL CHECK (resolution IN ('PT1H', 'P1D', 'P1M')),
    forecast_origin timestamptz NOT NULL,
    predicted_load double precision NOT NULL CHECK (predicted_load >= 0 AND predicted_load < 'Infinity'::float8),
    lower_bound double precision,
    upper_bound double precision,
    value_unit text NOT NULL,
    aggregation text NOT NULL CHECK (aggregation IN ('demo_mean', 'sum', 'mean', 'max', 'last')),
    is_mock boolean NOT NULL,
    model_version text NOT NULL,
    interval_level double precision CHECK (interval_level > 0 AND interval_level < 1),
    CHECK (forecast_origin <= timestamp),
    CHECK ((horizon = 'day' AND resolution = 'PT1H') OR
           (horizon = 'month' AND resolution = 'P1D') OR
           (horizon = 'year' AND resolution = 'P1M')),
    CHECK ((lower_bound IS NULL AND upper_bound IS NULL) OR
           (lower_bound IS NOT NULL AND upper_bound IS NOT NULL AND
            lower_bound >= 0 AND lower_bound <= predicted_load AND
            predicted_load <= upper_bound AND upper_bound < 'Infinity'::float8)),
    CHECK (interval_level IS NULL OR (lower_bound IS NOT NULL AND upper_bound IS NOT NULL)),
    UNIQUE NULLS NOT DISTINCT (route_id, stop_id, direction_id, timestamp, horizon, forecast_origin, model_version)
);
COMMIT;
