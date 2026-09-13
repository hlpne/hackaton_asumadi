-- Real database checks. Test rows/functions disappear at ROLLBACK.
-- Identity sequence values may advance: PostgreSQL sequences are not transactional.
BEGIN;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION pg_temp.assert_true(ok boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF ok IS DISTINCT FROM TRUE THEN
        RAISE EXCEPTION 'DB_CHECK_FAILED: %', label;
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
            RAISE EXCEPTION 'DB_CHECK_FAILED: %, expected SQLSTATE %, got %',
                label, expected_state, actual_state;
        END IF;
        RAISE NOTICE 'PASS: %', label;
        RETURN;
    END;
    RAISE EXCEPTION 'DB_CHECK_FAILED: %, statement unexpectedly succeeded', label;
END;
$$;

SELECT pg_temp.assert_true(current_setting('server_version_num')::int >= 160000,
    'PostgreSQL 16 or newer');
SELECT pg_temp.assert_true(
    (SELECT count(*) = 4 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
       AND table_name IN ('routes', 'stops', 'route_stops', 'forecasts')),
    'all four domain tables exist');
SELECT pg_temp.assert_true(
    (SELECT count(*) = 2 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'forecasts'
       AND column_name IN ('timestamp', 'forecast_origin')
       AND data_type = 'timestamp with time zone'),
    'forecast timestamps preserve instants across time zones');

DO $$
DECLARE
    prefix text := '__db_check_' || txid_current()::text || '_';
    route_a text := prefix || 'route_a';
    route_b text := prefix || 'route_b';
    stop_a text := prefix || 'stop_a';
    missing_id text := prefix || 'missing';
    point_id bigint;
    route_point_id bigint;
    before_count bigint;
    copy_columns text := 'contract_version, route_id, stop_id, direction_id, timestamp, '
        'horizon, resolution, forecast_origin, predicted_load, lower_bound, upper_bound, '
        'value_unit, aggregation, is_mock, model_version, interval_level';
BEGIN
    SELECT count(*) INTO before_count FROM forecasts;
    INSERT INTO routes(id, name, color) VALUES
        (route_a, 'DB check A', '#112233'), (route_b, 'DB check B', '#445566');
    INSERT INTO stops(id, name, lat, lon) VALUES (stop_a, 'DB check stop', 55.75, 37.61);
    INSERT INTO route_stops(route_id, stop_id, sequence, direction_id) VALUES
        (route_a, stop_a, 0, 0), (route_a, stop_a, 1, 0),
        (route_a, stop_a, 0, 1), (route_b, stop_a, 0, 0);
    PERFORM pg_temp.assert_true(
        (SELECT count(*) = 4 FROM route_stops WHERE stop_id = stop_a),
        'shared stop, two directions and repeated visits are supported');

    INSERT INTO forecasts(route_id, stop_id, direction_id, timestamp, horizon, resolution,
        forecast_origin, predicted_load, lower_bound, upper_bound, value_unit,
        aggregation, is_mock, model_version, interval_level)
    VALUES (route_a, stop_a, 0, '2026-09-26T08:00:00+03:00', 'day', 'PT1H',
        '2026-09-26T00:00:00+03:00', 100, 80, 120, 'demo_index',
        'demo_mean', true, 'db-check', 0.9)
    RETURNING id INTO point_id;

    PERFORM pg_temp.assert_true((SELECT count(*) = 1
        FROM forecasts f JOIN routes r ON r.id = f.route_id
        JOIN stops s ON s.id = f.stop_id
        JOIN route_stops rs ON rs.route_id = f.route_id AND rs.stop_id = f.stop_id
            AND rs.direction_id = f.direction_id AND rs.sequence = 0
        WHERE f.id = point_id AND f.predicted_load = 100),
        'forecast can be written and joined to route and stop');
    PERFORM pg_temp.assert_true(
        (SELECT timestamp = '2026-09-26T05:00:00Z'::timestamptz
         FROM forecasts WHERE id = point_id), 'UTC and Moscow represent the same instant');

    INSERT INTO forecasts(route_id, timestamp, horizon, resolution, forecast_origin,
        predicted_load, value_unit, aggregation, is_mock, model_version)
    VALUES (route_a, '2026-09-26T08:00:00+03:00', 'day', 'PT1H',
        '2026-09-26T00:00:00+03:00', 0, 'demo_index', 'demo_mean', true, 'db-check')
    RETURNING id INTO route_point_id;
    PERFORM pg_temp.assert_true((SELECT stop_id IS NULL AND direction_id IS NULL
        AND lower_bound IS NULL AND upper_bound IS NULL
        FROM forecasts WHERE id = route_point_id), 'route forecast and absent intervals are allowed');

    INSERT INTO forecasts(route_id, timestamp, horizon, resolution, forecast_origin,
        predicted_load, value_unit, aggregation, is_mock, model_version)
    VALUES
        (route_a, '2026-10-01T00:00:00+03:00', 'month', 'P1D',
         '2026-09-26T00:00:00+03:00', 50, 'demo_index', 'demo_mean', true, 'db-check'),
        (route_a, '2026-10-01T00:00:00+03:00', 'year', 'P1M',
         '2026-09-26T00:00:00+03:00', 60, 'demo_index', 'demo_mean', true, 'db-check');
    PERFORM pg_temp.assert_true(
        (SELECT count(*) = before_count + 4 FROM forecasts), 'day, month and year can be stored');

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO route_stops VALUES (%L, %L, 0, 0)', missing_id, stop_a),
        '23503', 'route_stops rejects a missing route');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO route_stops VALUES (%L, %L, 5, 0)', route_a, missing_id),
        '23503', 'route_stops rejects a missing stop');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO route_stops VALUES (%L, %L, 0, 0)', route_a, stop_a),
        '23505', 'route position is unique within a direction');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET route_id = %L WHERE id = %s', missing_id, point_id),
        '23503', 'forecast rejects a missing route');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET stop_id = %L WHERE id = %s', missing_id, point_id),
        '23503', 'forecast rejects a missing stop');
    PERFORM pg_temp.expect_error(format('DELETE FROM routes WHERE id = %L', route_a),
        '23503', 'referenced routes cannot be deleted');
    PERFORM pg_temp.expect_error(format('DELETE FROM stops WHERE id = %L', stop_a),
        '23503', 'referenced stops cannot be deleted');

    PERFORM pg_temp.expect_error(format('UPDATE stops SET lat = 91 WHERE id = %L', stop_a),
        '23514', 'invalid latitude is rejected');
    PERFORM pg_temp.expect_error(format('UPDATE stops SET lon = -181 WHERE id = %L', stop_a),
        '23514', 'invalid longitude is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE route_stops SET sequence = -1 WHERE route_id = %L', route_a),
        '23514', 'negative stop order is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET direction_id = 2 WHERE id = %s', point_id),
        '23514', 'unknown direction is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET horizon = ''week'' WHERE id = %s', point_id),
        '23514', 'unknown horizon is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET resolution = ''P1M'' WHERE id = %s', point_id),
        '23514', 'horizon and resolution must agree');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET forecast_origin = timestamp + interval ''1 hour'' WHERE id = %s', point_id),
        '23514', 'forecast origin cannot be after its point');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET predicted_load = -1 WHERE id = %s', route_point_id),
        '23514', 'negative prediction is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET predicted_load = ''Infinity''::float8 WHERE id = %s', route_point_id),
        '23514', 'infinite prediction is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET predicted_load = ''NaN''::float8 WHERE id = %s', route_point_id),
        '23514', 'NaN prediction is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET lower_bound = NULL WHERE id = %s', point_id),
        '23514', 'only one interval bound is rejected');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET upper_bound = 90 WHERE id = %s', point_id),
        '23514', 'prediction must lie inside its interval');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET interval_level = 1 WHERE id = %s', point_id),
        '23514', 'interval level must be strictly between zero and one');
    PERFORM pg_temp.expect_error(format(
        'UPDATE forecasts SET interval_level = 0.9 WHERE id = %s', route_point_id),
        '23514', 'interval level requires bounds');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO forecasts (%s) SELECT %s FROM forecasts WHERE id = %s',
        copy_columns, copy_columns, point_id), '23505', 'duplicate stop forecast is rejected');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO forecasts (%s) SELECT %s FROM forecasts WHERE id = %s',
        copy_columns, copy_columns, route_point_id),
        '23505', 'duplicate route forecast is rejected even with NULL keys');
END;
$$;
ROLLBACK;
