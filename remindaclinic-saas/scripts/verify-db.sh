#!/usr/bin/env bash
# Valida las migraciones de Supabase contra un Postgres 16 efímero y local
# (sin Docker ni red). Aplica un stub del esquema `auth` de Supabase, corre las
# migraciones y ejecuta las pruebas de trigger + RLS.
#
# Uso:  ./scripts/verify-db.sh
# Requiere: binarios de servidor de PostgreSQL 16 (initdb, pg_ctl, psql).
# Nota: Postgres no corre como root; si eres root, ejecútalo vía el usuario
#       `postgres` (este script lo detecta y hace re-exec con `su postgres`).

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../supabase/migrations"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
export PATH="$PGBIN:$PATH"

# Re-exec como usuario postgres si nos ejecutan como root.
if [ "$(id -u)" = "0" ]; then
  WORK="$(mktemp -d /tmp/remindaclinic-db.XXXXXX)"
  cp "$MIG"/*.sql "$HERE"/auth_stub.sql "$HERE"/db_tests.sql "$WORK"/
  cp "${BASH_SOURCE[0]}" "$WORK/verify.sh"
  chown -R postgres:postgres "$WORK"
  exec su postgres -c "STANDALONE_DIR='$WORK' bash '$WORK/verify.sh'"
fi

# Modo standalone (dentro de STANDALONE_DIR) o modo normal desde el repo.
if [ -n "${STANDALONE_DIR:-}" ]; then
  DIR="$STANDALONE_DIR"; AUTH="$DIR/auth_stub.sql"; TESTS="$DIR/db_tests.sql"
  M1="$DIR/0001_init.sql"; M2="$DIR/0002_rls.sql"
else
  DIR="$(mktemp -d)"; AUTH="$HERE/auth_stub.sql"; TESTS="$HERE/db_tests.sql"
  M1="$MIG/0001_init.sql"; M2="$MIG/0002_rls.sql"
fi

DATA="$DIR/data"; SOCK="$DIR/sock"; PORT="${PGPORT:-5439}"
mkdir -p "$DATA" "$SOCK"
initdb -D "$DATA" -U postgres --auth=trust >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -p $PORT -c listen_addresses=''" -l "$DIR/pg.log" -w start >/dev/null
trap 'pg_ctl -D "$DATA" -w stop >/dev/null 2>&1 || true' EXIT

PSQL=(psql -v ON_ERROR_STOP=1 -q -h "$SOCK" -p "$PORT" -U postgres -d remindaclinic)
createdb -h "$SOCK" -p "$PORT" -U postgres remindaclinic

"${PSQL[@]}" -f "$AUTH"
"${PSQL[@]}" -f "$M1" >/dev/null && echo "migracion 0001_init  OK"
"${PSQL[@]}" -f "$M2" >/dev/null && echo "migracion 0002_rls   OK"
echo "== TESTS =="
psql -q -h "$SOCK" -p "$PORT" -U postgres -d remindaclinic -f "$TESTS"
