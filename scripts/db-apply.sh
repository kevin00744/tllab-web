#!/usr/bin/env bash
# 套用 supabase/migrations（已套用過的會跳過），可選擇一併載入示範資料。
# 套用紀錄寫在 supabase_migrations.schema_migrations，與 Supabase CLI 相容。
#
# 用法：
#   DATABASE_URL='postgresql://...' scripts/db-apply.sh [--seed]
#
# 有 Docker 時會以 postgres:15-alpine 容器內的 psql 執行
# （Ubuntu 18.04 內建 psql 10 版本過舊）；也可用 PSQL_CMD="psql ..." 自行指定。
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SEED=false
[ "${1:-}" = "--seed" ] && SEED=true

if [ -n "${PSQL_CMD:-}" ]; then
  read -r -a RUN <<< "$PSQL_CMD"
elif [ -n "${DATABASE_URL:-}" ]; then
  if command -v docker >/dev/null 2>&1; then
    RUN=(docker run --rm -i --network host postgres:15-alpine psql "$DATABASE_URL")
  else
    RUN=(psql "$DATABASE_URL")
  fi
else
  echo "請設定 DATABASE_URL（Supabase → Connect → Session pooler 連線字串）" >&2
  exit 1
fi
RUN+=(-v ON_ERROR_STOP=1 -q -X)

"${RUN[@]}" <<'SQL'
set client_min_messages = warning;
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text not null primary key,
  statements text[],
  name text
);
SQL

applied="$("${RUN[@]}" -tA -c 'select version from supabase_migrations.schema_migrations')"

for f in "$ROOT"/supabase/migrations/*.sql; do
  base="$(basename "$f" .sql)"
  version="${base%%_*}"
  name="${base#*_}"
  if grep -qx "$version" <<< "$applied"; then
    echo "  略過 $base（已套用）"
    continue
  fi
  echo "→ 套用 $base"
  {
    echo "begin;"
    cat "$f"
    echo
    echo "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name');"
    echo "commit;"
  } | "${RUN[@]}"
done

if $SEED; then
  echo "→ 載入示範資料 seed.sql"
  "${RUN[@]}" < "$ROOT/supabase/seed.sql"
fi

echo "✓ 完成"
