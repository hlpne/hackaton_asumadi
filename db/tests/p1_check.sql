-- P1 forecast persistence and migration-history checks. All fixtures roll back.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'DB_P1_CHECK_FAILED: %', label;
    END IF;
    RAISE NOTICE 'PASS: %', label;
END;
$$;

CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text, label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
    BEGIN
        EXECUTE statement;
    EXCEPTION WHEN OTHERS THEN
        GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
        IF actual_state <> expected_state THEN
            RAISE EXCEPTION 'DB_P1_CHECK_FAILED: %, expected SQLSTATE %, got %',
                label, expected_state, actual_state;
        END IF;
        RAISE NOTICE 'PASS: %', label;
        RETURN;
    END;
    RAISE EXCEPTION 'DB_P1_CHECK_FAILED: %, statement unexpectedly succeeded', label;
END;
$$;

SELECT pg_temp.assert_true(
    (SELECT count(*) = 3 FROM schema_migrations),
    'three numbered migrations are recorded');
SELECT pg_temp.assert_true(
    (SELECT bool_and(length(checksum) = 64) FROM schema_migrations),
    'migration checksums are recorded as SHA-256');
SELECT pg_temp.assert_true(to_regclass('public.model_runs') IS NOT NULL,
    'model_runs exists');
SELECT pg_temp.assert_true(
    (SELECT count(*) = 1 FROM model_runs WHERE model_version = 'mock-seed-v1'),
    'demo model run is registered');
SELECT pg_temp.assert_true(
    NOT EXISTS (
        SELECT 1 FROM forecasts f
        LEFT JOIN route_stops rs
          ON rs.route_id = f.route_id
         AND rs.stop_id = f.stop_id
         AND rs.direction_id = f.direction_id
        WHERE f.stop_id IS NOT NULL AND rs.route_id IS NULL
    ),
    'all stop forecasts match route_stops including direction');

DO $$
DECLARE
    prefix text := '__p1_check_' || txid_current()::text || '_';
    route_a text := prefix || 'route_a';
    route_b text := prefix || 'route_b';
    stop_a text := prefix || 'stop_a';
    stop_b text := prefix || 'stop_b';
    point_id bigint;
BEGIN
    INSERT INTO routes(id, name, color) VALUES
        (route_a, 'P1 route A', '#112233'),
        (route_b, 'P1 route B', '#445566');
    INSERT INTO stops(id, name, lat, lon) VALUES
        (stop_a, 'P1 stop A', 55.75, 37.61),
        (stop_b, 'P1 stop B', 55.76, 37.62);
    INSERT INTO route_stops(route_id, stop_id, sequence, direction_id) VALUES
        (route_a, stop_a, 0, 0),
        (route_b, stop_b, 0, 0);

    INSERT INTO forecasts(route_id, stop_id, direction_id, timestamp, horizon, resolution,
        forecast_origin, predicted_load, value_unit, aggregation, is_mock, model_version)
    VALUES (route_a, stop_a, 0, '2026-09-26T08:00:00+03:00', 'day', 'PT1H',
        '2026-09-26T00:00:00+03:00', 10, 'demo_index', 'demo_mean', true, prefix || 'model')
    RETURNING id INTO point_id;

    PERFORM pg_temp.assert_true(
        (SELECT count(*) = 1 FROM model_runs WHERE model_version = prefix || 'model'),
        'direct forecast writes register model_runs metadata');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO forecasts(route_id, stop_id, direction_id, timestamp, horizon, resolution, '
        'forecast_origin, predicted_load, value_unit, aggregation, is_mock, model_version) '
        'VALUES (%L, %L, 0, now(), ''day'', ''PT1H'', now(), 1, ''demo_index'', ''demo_mean'', true, %L)',
        route_a, stop_b, prefix || 'mismatch'), '23503',
        'forecast rejects a stop from another route');
    INSERT INTO forecasts(route_id, stop_id, timestamp, horizon, resolution, forecast_origin,
        predicted_load, value_unit, aggregation, is_mock, model_version)
    VALUES (route_a, stop_a, '2026-09-26T09:00:00+03:00', 'day', 'PT1H',
        '2026-09-26T00:00:00+03:00', 1, 'demo_index', 'demo_mean', true,
        prefix || 'inferred-direction');
    PERFORM pg_temp.assert_true(
        (SELECT direction_id = 0 FROM forecasts
         WHERE model_version = prefix || 'inferred-direction'),
        'unambiguous legacy stop forecast receives its direction');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO forecasts(route_id, direction_id, timestamp, horizon, resolution, forecast_origin, '
        'predicted_load, value_unit, aggregation, is_mock, model_version) '
        'VALUES (%L, 1, now(), ''day'', ''PT1H'', now(), 1, ''demo_index'', ''demo_mean'', true, %L)',
        route_a, prefix || 'missing-route-direction'), '23503',
        'route-level direction must exist');
    PERFORM pg_temp.expect_error(format(
        'DELETE FROM route_stops WHERE route_id = %L AND stop_id = %L AND direction_id = 0',
        route_a, stop_a), '23503',
        'last route-stop-direction link cannot orphan a forecast');
    PERFORM pg_temp.expect_error(format(
        'DELETE FROM model_runs WHERE model_version = %L', prefix || 'model'), '23503',
        'model run referenced by forecasts cannot be deleted');
    PERFORM pg_temp.expect_error(format(
        'UPDATE model_runs SET value_unit = ''passengers'' WHERE model_version = %L',
        prefix || 'model'), '23514',
        'model run metadata cannot diverge from persisted forecasts');

    INSERT INTO forecasts(route_id, timestamp, horizon, resolution, forecast_origin,
        predicted_load, value_unit, aggregation, is_mock, model_version)
    VALUES
        (route_a, '2026-09-26T08:01:00+03:00', 'day', 'PT1M',
         '2026-09-26T00:00:00+03:00', 11, 'demo_index', 'demo_mean', true, prefix || 'minute'),
        (route_a, '2026-09-26T08:02:00+03:00', 'day', 'schedule',
         '2026-09-26T00:00:00+03:00', 12, 'demo_index', 'demo_mean', true, prefix || 'schedule');
    PERFORM pg_temp.assert_true(
        (SELECT count(*) = 2 FROM forecasts
         WHERE model_version IN (prefix || 'minute', prefix || 'schedule')),
        'PT1M and schedule forecasts can be persisted');
END;
$$;

ROLLBACK;
