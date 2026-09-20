#!/bin/sh
# PostgreSQL docker-entrypoint hook for a new, empty database.
set -eu
DB_ROOT=${DB_ROOT:-/opt/transport/db}
PGHOST=/var/run/postgresql sh "$DB_ROOT/scripts/manage.sh" migrate
PGHOST=/var/run/postgresql sh "$DB_ROOT/scripts/manage.sh" seed
