#!/usr/bin/env bash
# 匯出實驗室資料（public schema 的資料，不含 schema 本身與登入帳號）
#
# 用法：
#   DATABASE_URL='postgresql://...' scripts/db-backup.sh [輸出目錄，預設 ./backups] [保留天數，預設 30]
#
# 有 Docker 時以 postgres:15-alpine 容器內的 pg_dump 執行；也可用 PG_DUMP_CMD="pg_dump ..." 自行指定。
set -euo pipefail

: "${DATABASE_URL:?請設定 DATABASE_URL（Supabase → Connect → Session pooler 連線字串）}"
DEST="${1:-./backups}"
KEEP_DAYS="${2:-30}"

if [ -n "${PG_DUMP_CMD:-}" ]; then
  read -r -a RUN <<< "$PG_DUMP_CMD"
elif command -v docker >/dev/null 2>&1; then
  RUN=(docker run --rm --network host postgres:15-alpine pg_dump)
else
  RUN=(pg_dump)
fi

mkdir -p "$DEST"
OUT="$DEST/tllab-$(date +%Y%m%d-%H%M).dump"
# documents 的自我參照外鍵會讓 pg_dump 提出警告；db-restore.sh 已處理，這裡略過該警告
"${RUN[@]}" "$DATABASE_URL" -Fc --data-only --schema=public > "$OUT.tmp" \
  2> >(grep -v -e 'circular foreign-key' -e 'detail: documents' -e 'hint: ' >&2)
mv "$OUT.tmp" "$OUT"
find "$DEST" -name 'tllab-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "✓ $OUT ($(du -h "$OUT" | cut -f1))"
