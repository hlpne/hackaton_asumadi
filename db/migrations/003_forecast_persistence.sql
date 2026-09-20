-- Forecast persistence integrity, model provenance and query support.

CREATE TABLE IF NOT EXISTS model_runs (
    model_version text PRIMARY KEY,
    is_mock boolean NOT NULL,
    value_unit text NOT NULL,
    aggregation text NOT NULL CHECK (aggregation IN ('demo_mean', 'sum', 'mean', 'max', 'last')),
    interval_level double precision CHECK (interval_level > 0 AND interval_level < 1),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Older databases may have stop forecasts without direction. Backfill only
-- unambiguous route/stop mappings and fail instead of guessing otherwise.
WITH unambiguous AS (
    SELECT route_id, stop_id, min(direction_id) AS direction_id
    FROM route_stops
    GROUP BY route_id, stop_id
    HAVING count(DISTINCT direction_id) = 1
)
UPDATE forecasts AS f
SET direction_id = u.direction_id
FROM unambiguous AS u
WHERE f.route_id = u.route_id
  AND f.stop_id = u.stop_id
  AND f.direction_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM forecasts WHERE stop_id IS NOT NULL AND direction_id IS NULL) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Cannot migrate forecasts: a stop forecast has no unambiguous direction';
    END IF;
    IF EXISTS (
        SELECT model_version
        FROM forecasts
        GROUP BY model_version
        HAVING count(DISTINCT (is_mock, value_unit, aggregation)) > 1
            OR count(DISTINCT interval_level) > 1
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'Cannot migrate forecasts: one model_version has conflicting metadata';
    END IF;
END;
$$;

INSERT INTO model_runs(model_version, is_mock, value_unit, aggregation, interval_level)
SELECT model_version, bool_and(is_mock), min(value_unit), min(aggregation), min(interval_level)
FROM forecasts
GROUP BY model_version
ON CONFLICT (model_version) DO NOTHING;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'forecasts'::regclass
          AND conname = 'forecasts_model_version_fkey'
    ) THEN
        ALTER TABLE forecasts
            ADD CONSTRAINT forecasts_model_version_fkey
            FOREIGN KEY (model_version) REFERENCES model_runs(model_version);
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'forecasts'::regclass
          AND conname = 'forecasts_stop_requires_direction'
    ) THEN
        ALTER TABLE forecasts
            ADD CONSTRAINT forecasts_stop_requires_direction
            CHECK (stop_id IS NULL OR direction_id IS NOT NULL) NOT VALID;
        ALTER TABLE forecasts VALIDATE CONSTRAINT forecasts_stop_requires_direction;
    END IF;
END;
$$;

-- Replace the original checks so persisted day forecasts may use every
-- resolution already supported by the public API.
DO $$
DECLARE
    constraint_name text;
BEGIN
    FOR constraint_name IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'forecasts'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%resolution%'
    LOOP
        EXECUTE format('ALTER TABLE forecasts DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END;
$$;

ALTER TABLE forecasts
    ADD CONSTRAINT forecasts_horizon_resolution_check
    CHECK ((horizon = 'day' AND resolution IN ('schedule', 'PT1M', 'PT1H')) OR
           (horizon = 'month' AND resolution = 'P1D') OR
           (horizon = 'year' AND resolution = 'P1M'));

CREATE OR REPLACE FUNCTION register_forecast_model_run()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO model_runs(model_version, is_mock, value_unit, aggregation, interval_level)
    VALUES (NEW.model_version, NEW.is_mock, NEW.value_unit, NEW.aggregation, NEW.interval_level)
    ON CONFLICT (model_version) DO NOTHING;

    UPDATE model_runs
    SET interval_level = NEW.interval_level
    WHERE model_version = NEW.model_version
      AND interval_level IS NULL
      AND NEW.interval_level IS NOT NULL;

    IF NOT EXISTS (
        SELECT 1 FROM model_runs
        WHERE model_version = NEW.model_version
          AND is_mock = NEW.is_mock
          AND value_unit = NEW.value_unit
          AND aggregation = NEW.aggregation
          AND (interval_level IS NULL
               OR NEW.interval_level IS NULL
               OR interval_level = NEW.interval_level)
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'model_version is already registered with different metadata';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecasts_model_run_guard ON forecasts;
CREATE TRIGGER forecasts_model_run_guard
BEFORE INSERT OR UPDATE OF model_version, is_mock, value_unit, aggregation, interval_level ON forecasts
FOR EACH ROW EXECUTE FUNCTION register_forecast_model_run();

CREATE OR REPLACE FUNCTION protect_model_run_metadata()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM forecasts
        WHERE model_version = OLD.model_version
          AND ((is_mock, value_unit, aggregation)
                   IS DISTINCT FROM
                   (NEW.is_mock, NEW.value_unit, NEW.aggregation)
               OR (interval_level IS NOT NULL
                   AND NEW.interval_level IS NOT NULL
                   AND interval_level <> NEW.interval_level))
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'model run metadata cannot diverge from persisted forecasts';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS model_runs_metadata_guard ON model_runs;
CREATE TRIGGER model_runs_metadata_guard
BEFORE UPDATE OF is_mock, value_unit, aggregation, interval_level ON model_runs
FOR EACH ROW EXECUTE FUNCTION protect_model_run_metadata();

CREATE OR REPLACE FUNCTION validate_forecast_route_stop_direction()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    inferred_direction smallint;
    direction_count integer;
BEGIN
    IF NEW.direction_id IS NOT NULL AND NEW.direction_id NOT IN (0, 1) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'forecast direction_id must be 0 or 1';
    END IF;

    IF NEW.stop_id IS NOT NULL AND NEW.direction_id IS NULL THEN
        SELECT min(direction_id), count(DISTINCT direction_id)
        INTO inferred_direction, direction_count
        FROM route_stops
        WHERE route_id = NEW.route_id AND stop_id = NEW.stop_id;
        IF direction_count <> 1 THEN
            RAISE EXCEPTION USING
                ERRCODE = '23503',
                MESSAGE = 'stop forecast direction cannot be inferred unambiguously';
        END IF;
        NEW.direction_id := inferred_direction;
    END IF;

    IF NEW.direction_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.stop_id IS NULL THEN
        PERFORM 1 FROM route_stops
        WHERE route_id = NEW.route_id AND direction_id = NEW.direction_id
        FOR KEY SHARE;
    ELSE
        PERFORM 1 FROM route_stops
        WHERE route_id = NEW.route_id
          AND stop_id = NEW.stop_id
          AND direction_id = NEW.direction_id
        FOR KEY SHARE;
    END IF;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            MESSAGE = format(
                'forecast route/stop/direction does not exist: route=%s stop=%s direction=%s',
                NEW.route_id, coalesce(NEW.stop_id, '<route-level>'), NEW.direction_id
            );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS forecasts_route_stop_direction_guard ON forecasts;
CREATE TRIGGER forecasts_route_stop_direction_guard
BEFORE INSERT OR UPDATE OF route_id, stop_id, direction_id ON forecasts
FOR EACH ROW EXECUTE FUNCTION validate_forecast_route_stop_direction();

CREATE OR REPLACE FUNCTION protect_route_stop_forecasts()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE'
       AND (OLD.route_id, OLD.stop_id, OLD.direction_id)
           IS NOT DISTINCT FROM (NEW.route_id, NEW.stop_id, NEW.direction_id) THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM route_stops
        WHERE route_id = OLD.route_id
          AND stop_id = OLD.stop_id
          AND direction_id = OLD.direction_id
    ) AND EXISTS (
        SELECT 1 FROM forecasts
        WHERE route_id = OLD.route_id
          AND stop_id = OLD.stop_id
          AND direction_id = OLD.direction_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            MESSAGE = 'route_stops row is referenced by a persisted stop forecast';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM route_stops
        WHERE route_id = OLD.route_id AND direction_id = OLD.direction_id
    ) AND EXISTS (
        SELECT 1 FROM forecasts
        WHERE route_id = OLD.route_id
          AND stop_id IS NULL
          AND direction_id = OLD.direction_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23503',
            MESSAGE = 'route direction is referenced by a persisted route forecast';
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS route_stops_forecast_guard ON route_stops;
CREATE TRIGGER route_stops_forecast_guard
AFTER DELETE OR UPDATE OF route_id, stop_id, direction_id ON route_stops
FOR EACH ROW EXECUTE FUNCTION protect_route_stop_forecasts();

CREATE INDEX IF NOT EXISTS forecasts_series_lookup
    ON forecasts(route_id, stop_id, direction_id, horizon, forecast_origin, timestamp);
