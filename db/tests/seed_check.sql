-- Only for the isolated acceptance database, never for an existing team database.
DO $$
BEGIN
    IF (SELECT count(*) FROM routes) <> 3
       OR (SELECT count(*) FROM stops) <> 24
       OR (SELECT count(*) FROM route_stops) <> 48
       OR (SELECT count(*) FROM forecasts) <> 648 THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: expected 3 routes, 24 stops, 48 links, 648 forecasts';
    END IF;
    IF EXISTS (
        SELECT 1 FROM route_stops rs
        LEFT JOIN routes r ON r.id = rs.route_id
        LEFT JOIN stops s ON s.id = rs.stop_id
        WHERE r.id IS NULL OR s.id IS NULL
    ) THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: orphan route-stop link';
    END IF;
    IF (SELECT count(*) FROM forecasts WHERE stop_id IS NULL) <> 72
       OR (SELECT count(*) FROM forecasts WHERE stop_id IS NOT NULL) <> 576
       OR (SELECT count(DISTINCT route_id) FROM forecasts) <> 3
       OR (SELECT count(DISTINCT stop_id) FROM forecasts WHERE stop_id IS NOT NULL) <> 24 THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: incomplete route/stop forecast coverage';
    END IF;
    IF EXISTS (
        SELECT 1 FROM forecasts
        WHERE NOT is_mock
           OR model_version <> 'mock-seed-v1'
           OR value_unit <> 'demo_index'
           OR horizon <> 'day'
           OR resolution <> 'PT1H'
           OR lower_bound IS NULL
           OR upper_bound IS NULL
    ) THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: invalid demo forecast metadata';
    END IF;
    IF (SELECT count(DISTINCT timestamp) FROM forecasts) <> 24
       OR (SELECT min(timestamp) FROM forecasts) <> '2026-09-26T00:00:00+03:00'::timestamptz
       OR (SELECT max(timestamp) FROM forecasts) <> '2026-09-26T23:00:00+03:00'::timestamptz THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: expected a complete 24-hour forecast grid';
    END IF;
    IF (SELECT count(DISTINCT predicted_load) FROM forecasts) < 100
       OR (SELECT max(predicted_load) - min(predicted_load) FROM forecasts) < 40 THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: forecast load levels are not varied enough';
    END IF;
    RAISE NOTICE 'SEED_CHECK_OK';
END;
$$;
