#!/bin/sh
set -eu
DB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export PGUSER="${POSTGRES_USER:?POSTGRES_USER is required}"
export PGDATABASE="${POSTGRES_DB:?POSTGRES_DB is required}"
export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"

run() { sh "$DB_ROOT/scripts/manage.sh" "$1"; }
fingerprint() {
    psql -X --no-password -v ON_ERROR_STOP=1 -Atc "
        SELECT md5(jsonb_build_object(
            'routes', (SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM routes r),
            'stops', (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM stops s),
            'links', (SELECT jsonb_agg(to_jsonb(rs) ORDER BY route_id, direction_id, sequence)
                      FROM route_stops rs),
            'forecasts', (SELECT jsonb_agg(to_jsonb(f) - 'id' ORDER BY route_id,
                          stop_id NULLS FIRST, timestamp) FROM forecasts f))::text);"
}

# Verify that the official image initialized tables/seed before health became ready.
run status
psql -X --no-password -v ON_ERROR_STOP=1 -f "$DB_ROOT/tests/seed_check.sql"
first_fingerprint=$(fingerprint)
run migrate
run seed
run migrate
run seed
test "$(fingerprint)" = "$first_fingerprint"
echo "SEED_REPEAT_OK"
run check
# check.sql rolls back fixtures; the real seed must remain intact.
psql -X --no-password -v ON_ERROR_STOP=1 -f "$DB_ROOT/tests/seed_check.sql"
test "$(fingerprint)" = "$first_fingerprint"
echo "DB_ACCEPTANCE_OK"
