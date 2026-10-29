#!/usr/bin/env bash
# 在暫存的 PostgreSQL 16 上套用 migrations + seed 並執行 RLS 測試
# 用法：scripts/test-db.sh   （需要本機 PostgreSQL 16 執行檔）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUN_AS=()
[ "$(id -u)" = "0" ] && { chown -R postgres "$WORK"; RUN_AS=(sudo -u postgres); }
cleanup() { "${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" stop -m fast >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN_AS[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres -A trust >/dev/null
"${RUN_AS[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c timezone=UTC" -l "$WORK/log" start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X)
"${PSQL[@]}" -c "alter database postgres set search_path = public, extensions"
"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
export PSQL_CMD="psql -h $WORK -p $PORT -U postgres -d postgres"
"$ROOT/scripts/db-apply.sh" --seed
echo "→ 再次執行 db-apply（應全部略過）"
"$ROOT/scripts/db-apply.sh"
echo "→ tests"
"${PSQL[@]}" -f "$ROOT/supabase/tests/rls_test.sql"
echo "✓ 全部通過"
