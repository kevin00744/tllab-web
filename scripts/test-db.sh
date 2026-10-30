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
echo "→ 備份 → 還原到空資料庫"
export DATABASE_URL="postgresql://postgres@localhost:$PORT/postgres?host=$WORK"
PG_DUMP_CMD="pg_dump" "$ROOT/scripts/db-backup.sh" "$WORK/backups"
"${PSQL[@]}" -c "create database restore_test"
"${PSQL[@]}" -d restore_test -c "alter database restore_test set search_path = public, extensions"
"${PSQL[@]}" -d restore_test -f "$ROOT/supabase/tests/supabase_stub.sql" 2>/dev/null \
  || "${PSQL[@]}" -d restore_test -f <(grep -v '^create role' "$ROOT/supabase/tests/supabase_stub.sql")
PSQL_CMD="psql -h $WORK -p $PORT -U postgres -d restore_test" "$ROOT/scripts/db-apply.sh" >/dev/null
PSQL_CMD="psql -h $WORK -p $PORT -U postgres -d restore_test" \
  "$ROOT/scripts/db-restore.sh" "$(ls "$WORK"/backups/tllab-*.dump)"
for t in members projects tasks publications meetings activity_log page_settings task_assignees documents invite_codes invite_redemptions calendar_events calendar_event_members member_preferences board_posts board_post_mentions board_post_projects; do
  a="$("${PSQL[@]}" -tA -c "select count(*) from public.$t")"
  b="$("${PSQL[@]}" -d restore_test -tA -c "select count(*) from public.$t")"
  [ "$a" = "$b" ] || { echo "✗ $t 筆數不符：$a vs $b"; exit 1; }
done
"${PSQL[@]}" -d restore_test -tA -c "select count(*) from public.members where user_id is not null" | grep -qx 0
"${PSQL[@]}" -d restore_test -c "insert into public.tasks (title) values ('還原後可新增'); insert into public.activity_log (action, entity_type, entity_id) values ('insert','task',gen_random_uuid()); select public.create_invite_code()"
echo "✓ 全部通過"
