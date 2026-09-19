SELECT version() AS postgres_version, current_database() AS database_name;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('routes', 'stops', 'route_stops', 'forecasts',
                     'transit_calendars', 'transit_stops', 'transit_stop_times', 'transit_stop_map')
ORDER BY table_name;
SELECT 'routes' AS table_name, count(*) AS rows FROM routes
UNION ALL SELECT 'stops', count(*) FROM stops
UNION ALL SELECT 'route_stops', count(*) FROM route_stops
UNION ALL SELECT 'forecasts', count(*) FROM forecasts
UNION ALL SELECT 'transit_calendars', count(*) FROM transit_calendars
UNION ALL SELECT 'transit_stops', count(*) FROM transit_stops
UNION ALL SELECT 'transit_stop_times', count(*) FROM transit_stop_times
UNION ALL SELECT 'transit_stop_map', count(*) FROM transit_stop_map;
