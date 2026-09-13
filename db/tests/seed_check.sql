-- Only for the isolated acceptance database, never for an existing team database.
DO $$
BEGIN
    IF (SELECT count(*) FROM routes) <> 3
       OR (SELECT count(*) FROM stops) <> 24
       OR (SELECT count(*) FROM route_stops) <> 48
       OR (SELECT count(*) FROM forecasts) <> 0 THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: expected 3 routes, 24 stops, 48 links, 0 forecasts';
    END IF;
    IF EXISTS (
        SELECT 1 FROM route_stops rs
        LEFT JOIN routes r ON r.id = rs.route_id
        LEFT JOIN stops s ON s.id = rs.stop_id
        WHERE r.id IS NULL OR s.id IS NULL
    ) THEN
        RAISE EXCEPTION 'SEED_CHECK_FAILED: orphan route-stop link';
    END IF;
    RAISE NOTICE 'SEED_CHECK_OK';
END;
$$;
