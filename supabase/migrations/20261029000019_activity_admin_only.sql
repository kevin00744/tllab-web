-- =============================================================================
-- TL Lab Hub — 活動紀錄只有 Admin 看得到（階段 10 修正）
-- 一般成員、唯讀成員與未登入訪客都無法讀取活動紀錄；
-- 系統管理員以 delete_activity 刪除的紀錄會從全站移除（所有人都看不到）
-- =============================================================================

drop policy if exists activity_log_public on public.activity_log;
drop policy if exists activity_log_select on public.activity_log;
create policy activity_log_select on public.activity_log for select to authenticated
  using (public.is_admin());

revoke select on public.activity_log from anon;
revoke execute on function public.list_activity(jsonb) from public, anon;
grant execute on function public.list_activity(jsonb) to authenticated;
