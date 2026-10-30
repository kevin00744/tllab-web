-- =============================================================================
-- TL Lab Hub — 20 管理員快速管理、圖示上傳
--   admin_manage(p)：Admin 在各頁批量刪除、重新命名、移動、更換圖示
--   icons bucket：上傳的圖示（公開讀取，路徑 {member_id}/{uuid}.webp）
--   圖示欄位只接受短 emoji 或 icons bucket 的網址
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 圖示格式
-- -----------------------------------------------------------------------------
create or replace function public.icon_ok(p text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p is not null and (
    (char_length(p) between 1 and 16 and p !~ '[[:space:]<>"''`]')
    or (char_length(p) <= 500 and p ~ '^https?://[^[:space:]<>"''`]+/storage/v1/object/public/icons/[^[:space:]<>"''`]+$')
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array['projects', 'publications', 'meetings', 'documents', 'software_tools', 'pipelines', 'page_settings']
  loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_icon_ok');
    -- not valid：既有資料（例如 Notion 匯入）不受影響，之後的新增與修改都要符合
    execute format('alter table public.%I add constraint %I check (public.icon_ok(emoji)) not valid', t, t || '_icon_ok');
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- icons bucket
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('icons', 'icons', true, 1024 * 1024, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

drop policy if exists icons_read on storage.objects;
drop policy if exists icons_insert on storage.objects;
drop policy if exists icons_delete on storage.objects;
create policy icons_read on storage.objects for select
  using (bucket_id = 'icons');
-- 可編輯內容的成員上傳到自己的資料夾
create policy icons_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'icons'
              and public.is_editor()
              and (storage.foldername(name))[1] = public.current_member_id()::text);
create policy icons_delete on storage.objects for delete to authenticated
  using (bucket_id = 'icons'
         and (public.is_admin() or (storage.foldername(name))[1] = public.current_member_id()::text));

-- -----------------------------------------------------------------------------
-- admin_manage
--   p.entity : project / task / publication / document / faq / software / pipeline / meeting
--   p.action : delete（ids）/ rename（ids 一筆、value）/ move（ids、value）/ icon（ids、value）
--   move 的 value：專案＝狀態、任務＝專案 id（空白為不屬於專案）、論文＝階段、
--                  頁面＝上層頁面 id（空白為最上層）、FAQ／軟體＝分類、分析流程＝專案 id、會議＝類型
--   回傳處理筆數；全部在同一交易，任一筆失敗則全部不變
-- -----------------------------------------------------------------------------
create or replace function public.admin_manage(p jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_entity text := p ->> 'entity';
  v_action text := p ->> 'action';
  v_value  text := nullif(trim(coalesce(p ->> 'value', '')), '');
  v_ids    uuid[];
  v_id     uuid;
  v_uuid   uuid;
  v_table  text;
  v_count  integer := 0;
begin
  if not public.is_admin() then
    raise exception 'noPermission' using errcode = '42501';
  end if;
  v_table := case v_entity
    when 'project' then 'projects' when 'task' then 'tasks' when 'publication' then 'publications'
    when 'document' then 'documents' when 'faq' then 'faqs' when 'software' then 'software_tools'
    when 'pipeline' then 'pipelines' when 'meeting' then 'meetings' end;
  if v_table is null or jsonb_typeof(p -> 'ids') <> 'array'
     or exists (select 1 from jsonb_array_elements_text(p -> 'ids') x where x !~* '^[0-9a-f-]{36}$')
     or (v_action = 'move' and v_entity in ('task', 'pipeline', 'document') and v_value !~* '^[0-9a-f-]{36}$') then
    raise exception 'invalidFilter' using errcode = '22023';
  end if;
  select coalesce(array_agg(distinct x::uuid), '{}') into v_ids from jsonb_array_elements_text(p -> 'ids') x;
  if cardinality(v_ids) = 0 then
    raise exception 'invalidFilter' using errcode = '22023';
  end if;

  if v_action = 'delete' then
    -- 頁面刪除時子頁面一併刪除（cascade）：上層也被選取的子頁面不另外計算
    if v_entity = 'document' then
      select coalesce(array_agg(d.id), '{}') into v_ids
        from public.documents d
       where d.id = any(v_ids)
         and not exists (
           with recursive up as (
             select parent_id from public.documents where id = d.id
             union all
             select x.parent_id from public.documents x join up on x.id = up.parent_id
           ) select 1 from up where up.parent_id = any(v_ids));
    end if;
    foreach v_id in array v_ids loop
      execute format('select public.%I($1)', 'delete_' || v_entity) using v_id;
      v_count := v_count + 1;
    end loop;
    return v_count;

  elsif v_action = 'rename' then
    if cardinality(v_ids) <> 1 then raise exception 'invalidFilter' using errcode = '22023'; end if;
    if v_value is null then raise exception 'titleRequired' using errcode = '22023'; end if;
    execute format('update public.%I set %I = $1 where id = $2', v_table,
                   case v_entity when 'faq' then 'question' when 'software' then 'name' when 'pipeline' then 'name' else 'title' end)
      using left(v_value, 300), v_ids[1];
    get diagnostics v_count = row_count;

  elsif v_action = 'icon' then
    if v_entity in ('task', 'faq') then raise exception 'invalidFilter' using errcode = '22023'; end if;
    if not public.icon_ok(v_value) then raise exception 'iconInvalid' using errcode = '22023'; end if;
    execute format('update public.%I set emoji = $1 where id = any($2)', v_table) using v_value, v_ids;
    get diagnostics v_count = row_count;

  elsif v_action = 'move' then
    case v_entity
      when 'project' then
        if v_value is null or v_value not in (select unnest(enum_range(null::public.project_status))::text) then
          raise exception 'invalidFilter' using errcode = '22023';
        end if;
        update public.projects set status = v_value::public.project_status where id = any(v_ids);
      when 'publication' then
        if v_value is null or v_value not in (select unnest(enum_range(null::public.publication_stage))::text) then
          raise exception 'invalidFilter' using errcode = '22023';
        end if;
        update public.publications set stage = v_value::public.publication_stage where id = any(v_ids);
      when 'meeting' then
        if v_value is null or v_value not in (select unnest(enum_range(null::public.meeting_type))::text) then
          raise exception 'invalidFilter' using errcode = '22023';
        end if;
        update public.meetings set type = v_value::public.meeting_type where id = any(v_ids);
      when 'task', 'pipeline' then
        v_uuid := v_value::uuid;
        if v_uuid is not null and not exists (select 1 from public.projects where id = v_uuid) then
          raise exception 'notFound' using errcode = 'P0002';
        end if;
        execute format('update public.%I set project_id = $1 where id = any($2)', v_table) using v_uuid, v_ids;
      when 'faq', 'software' then
        if v_value is null then raise exception 'nameRequired' using errcode = '22023'; end if;
        execute format('update public.%I set category = $1 where id = any($2)', v_table) using left(v_value, 60), v_ids;
      when 'document' then
        v_uuid := v_value::uuid;
        if v_uuid is not null then
          if not exists (select 1 from public.documents d where d.id = v_uuid
                           and d.kind = all (select kind from public.documents where id = any(v_ids))) then
            raise exception 'notFound' using errcode = 'P0002';
          end if;
          -- 上層不能是自己或自己的子頁面
          if exists (
               with recursive up as (
                 select id, parent_id from public.documents where id = v_uuid
                 union all
                 select d.id, d.parent_id from public.documents d join up on d.id = up.parent_id
               ) select 1 from up where id = any(v_ids)) then
            raise exception 'invalidParent' using errcode = '22023';
          end if;
        end if;
        -- 移到新位置的最後面
        update public.documents d
           set parent_id = v_uuid,
               sort_order = (select coalesce(max(s.sort_order), 0) from public.documents s
                              where s.kind = d.kind and s.parent_id is not distinct from v_uuid) + x.n
          from (select id, row_number() over (order by sort_order, title) as n
                  from public.documents where id = any(v_ids)) x
         where d.id = x.id;
    end case;
    get diagnostics v_count = row_count;

  else
    raise exception 'invalidFilter' using errcode = '22023';
  end if;

  if v_count = 0 then
    raise exception 'notFound' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

revoke execute on function public.admin_manage(jsonb) from public, anon;
grant execute on function public.admin_manage(jsonb) to authenticated;
