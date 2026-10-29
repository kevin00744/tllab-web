-- =============================================================================
-- TL Lab Hub — 06 刪除成員時保留論文作者姓名
-- publication_authors.member_id 會被設為 null，先把姓名寫入 display_name，
-- 否則違反「必須有成員或姓名」的限制，作者紀錄也會遺失。
-- =============================================================================

create or replace function public.members_keep_author_names()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.publication_authors
     set display_name = coalesce(display_name, coalesce(old.name_en, old.name))
   where member_id = old.id;
  return old;
end;
$$;

create trigger members_keep_author_names before delete on public.members
  for each row execute function public.members_keep_author_names();
