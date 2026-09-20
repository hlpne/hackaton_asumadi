#!/bin/sh
# Run with sh; no executable bit or host-side psql is required in Docker.
set -eu
DB_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
export PGHOST="${PGHOST:-/var/run/postgresql}"
export PGPORT="${PGPORT:-5432}"
export PGUSER="${PGUSER:-${POSTGRES_USER:-transport}}"
export PGDATABASE="${PGDATABASE:-${POSTGRES_DB:-transport}}"
export PGPASSWORD="${PGPASSWORD:-${POSTGRES_PASSWORD:-}}"

sql_file() {
    psql -X --no-password --set=ON_ERROR_STOP=1 --file="$1"
}

ensure_migration_history() {
    psql -X --no-password --set=ON_ERROR_STOP=1 --quiet --command="
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version text PRIMARY KEY,
            name text NOT NULL,
            checksum text NOT NULL,
            applied_at timestamptz NOT NULL DEFAULT now()
        );"
}

apply_migrations() {
    ensure_migration_history
    for migration in "$DB_ROOT"/migrations/[0-9][0-9][0-9]_*.sql; do
        name=$(basename "$migration")
        version=${name%%_*}
        checksum=$(sha256sum "$migration" | awk '{print $1}')
        stored=$(psql -X --no-password --set=ON_ERROR_STOP=1 --tuples-only --no-align \
            --command="SELECT checksum FROM schema_migrations WHERE version = '$version'")
        if [ -n "$stored" ]; then
            if [ "$stored" != "$checksum" ]; then
                echo "Migration $version checksum mismatch: $name was changed after application" >&2
                exit 1
            fi
            echo "Skipping $name (already applied)"
            continue
        fi
        echo "Applying $name"
        printf '%s\n' \
            "INSERT INTO schema_migrations(version, name, checksum) VALUES (:'migration_version', :'migration_name', :'migration_checksum');" |
            psql -X --no-password --set=ON_ERROR_STOP=1 --single-transaction \
                --set=migration_version="$version" \
                --set=migration_name="$name" \
                --set=migration_checksum="$checksum" \
                --file="$migration" \
                --file=-
    done
}

case "${1:-help}" in
    migrate)
        apply_migrations
        ;;
    seed)
        sql_file "$DB_ROOT/seed/002_demo.sql"
        ;;
    check)
        sql_file "$DB_ROOT/tests/check.sql"
        sql_file "$DB_ROOT/tests/p1_check.sql"
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
