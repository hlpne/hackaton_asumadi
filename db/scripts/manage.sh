#!/bin/sh
# Run with sh; no executable bit or host-side psql is required in Docker.
set -eu
DB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export PGHOST="${PGHOST:-127.0.0.1}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-transport}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-transport}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

sql_file() {
    psql -X --no-password --set=ON_ERROR_STOP=1 --file="$1"
}

case "${1:-help}" in
    migrate)
        # v0 runner: each numbered migration must support reapplication.
        # Each migration owns its transaction; stop on the first failure.
        for migration in "$DB_ROOT"/migrations/*.sql; do
            echo "Applying $(basename "$migration")"
            sql_file "$migration"
        done
        ;;
    seed)
        sql_file "$DB_ROOT/seed/002_demo.sql"
        ;;
    check)
        sql_file "$DB_ROOT/tests/check.sql"
        echo "DB_CHECK_OK"
        ;;
    status)
        sql_file "$DB_ROOT/tests/status.sql"
        ;;
    shell)
        exec psql -X --no-password --set=ON_ERROR_STOP=1
        ;;
    *)
        echo "Usage: sh db/scripts/manage.sh {migrate|seed|check|status|shell}"
        exit 2
        ;;
esac
