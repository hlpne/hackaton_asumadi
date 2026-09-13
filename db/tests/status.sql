SELECT version() AS postgres_version, current_database() AS database_name;
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('routes', 'stops', 'route_stops', 'forecasts')
ORDER BY table_name;
SELECT 'routes' AS table_name, count(*) AS rows FROM routes
UNION ALL SELECT 'stops', count(*) FROM stops
UNION ALL SELECT 'route_stops', count(*) FROM route_stops
UNION ALL SELECT 'forecasts', count(*) FROM forecasts;
