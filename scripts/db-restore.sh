#!/usr/bin/env bash
# 把 db-backup.sh 的備份還原到「已套用 schema、尚無資料」的資料庫（例如新的 Supabase 專案）
#
# 用法：
#   DATABASE_URL='postgresql://...' scripts/db-apply.sh        # 先套用 schema（不要 --seed）
#   DATABASE_URL='postgresql://...' scripts/db-restore.sh backups/tllab-XXXX.dump
#
# * 不需要 superuser：只停用 public 資料表上的使用者 trigger（活動紀錄等），外鍵照常檢查。
# * 登入帳號不在備份中：成員的 user_id 會清空，成員重新登入時依 email 自動綁定。
# * 整個還原在單一交易中，失敗時不會留下一半的資料。
set -euo pipefail

: "${DATABASE_URL:?請設定 DATABASE_URL}"
DUMP="${1:?請指定備份檔}"
[ -f "$DUMP" ] || { echo "找不到 $DUMP" >&2; exit 1; }

if [ -n "${PSQL_CMD:-}" ]; then
  read -r -a PSQL <<< "$PSQL_CMD"
  read -r -a PG_RESTORE <<< "${PG_RESTORE_CMD:-pg_restore}"
elif command -v docker >/dev/null 2>&1; then
  PSQL=(docker run --rm -i --network host postgres:15-alpine psql "$DATABASE_URL")
  PG_RESTORE=(docker run --rm -i postgres:15-alpine pg_restore)
else
  PSQL=(psql "$DATABASE_URL")
  PG_RESTORE=(pg_restore)
fi

TABLES="members projects project_members publications publication_authors meetings meeting_attendees
meeting_projects tasks task_assignees action_items documents faqs software_tools pipelines pipeline_steps
attachments page_settings activity_log invite_codes invite_redemptions"

existing="$("${PSQL[@]}" -X -tA -c 'select count(*) from public.members')"
if [ "$existing" != "0" ]; then
  echo "目標資料庫已有 $existing 位成員；請還原到空的資料庫（只套用 schema、不要 --seed）。" >&2
  exit 1
fi

{
  echo "\\set ON_ERROR_STOP on"
  echo "begin;"
  echo "set client_min_messages = warning;"
  # migration 內建的頁面設定會由備份覆蓋
  echo "delete from public.page_settings;"
  # members.user_id → auth.users：新專案沒有帳號，先暫時移除外鍵
  echo "alter table public.members drop constraint members_user_id_fkey;"
  echo "alter table public.invite_redemptions drop constraint invite_redemptions_user_id_fkey;"
  # documents.parent_id 自我參照，資料順序不保證父頁面先匯入
  echo "alter table public.documents drop constraint documents_parent_id_fkey;"
  for t in $TABLES; do echo "alter table public.$t disable trigger user;"; done
  "${PG_RESTORE[@]}" --data-only --no-owner -f - < "$DUMP"
  echo "update public.members set user_id = null;"
  echo "update public.invite_redemptions set user_id = null;"
  for t in $TABLES; do echo "alter table public.$t enable trigger user;"; done
  echo "alter table public.documents add constraint documents_parent_id_fkey
          foreign key (parent_id) references public.documents (id) on delete cascade;"
  echo "alter table public.members add constraint members_user_id_fkey
          foreign key (user_id) references auth.users (id) on delete set null;"
  echo "alter table public.invite_redemptions add constraint invite_redemptions_user_id_fkey
          foreign key (user_id) references auth.users (id) on delete set null;"
  for t in activity_log invite_redemptions; do
    echo "select setval(pg_get_serial_sequence('public.$t', 'id'),
                        coalesce((select max(id) from public.$t), 0) + 1, false);"
  done
  echo "commit;"
} | "${PSQL[@]}" -X -q > /dev/null

echo "✓ 還原完成：$("${PSQL[@]}" -X -tA -c 'select count(*) from public.members') 位成員、$("${PSQL[@]}" -X -tA -c 'select count(*) from public.tasks') 個任務"
