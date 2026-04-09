#!/bin/sh
set -eu

/docker-entrypoint.sh postgres &
postgres_pid="$!"

# Wait until local server is ready.
until gosu postgres pg_isready -q; do
  sleep 1
done

# Keep role password aligned with POSTGRES_PASSWORD even on reused volumes.
if [ -n "${POSTGRES_USER:-}" ] && [ -n "${POSTGRES_PASSWORD:-}" ]; then
  gosu postgres psql \
    --dbname "${POSTGRES_DB:-postgres}" \
    -v ON_ERROR_STOP=1 \
    --set=role_name="${POSTGRES_USER}" \
    --set=role_pass="${POSTGRES_PASSWORD}" \
    -c "SELECT format('ALTER ROLE %I WITH PASSWORD %L', :'role_name', :'role_pass') \\gexec"
fi

wait "$postgres_pid"
