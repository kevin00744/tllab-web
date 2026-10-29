-- =============================================================================
-- TL Lab Hub — 09 專案頁面內容（Markdown，類 Notion 即時編輯）與進度報告簡報
-- -----------------------------------------------------------------------------
-- * projects.content：專案頁面本文（Markdown）；content_version 用於偵測同時編輯
-- * attachments：檔案存在 Storage「attachments」bucket：{entity_type}/{entity_id}/{uuid}.{ext}
--     kind = slides：PPT/PPTX 由網頁伺服器以 LibreOffice 轉成 PDF（preview_path）；PDF 直接預覽
--     kind = file  ：其他附件
-- * 活動紀錄：同一人 10 分鐘內對同一筆資料的連續修改合併為一筆，長文字只保留前 300 字
-- =============================================================================

alter table public.projects
  add column content text not null default '',
  add column content_version integer not null default 0;

alter table public.attachments
  add column kind text not null default 'file' check (kind in ('slides', 'file')),
  add column title text,
  add column preview_path text,
  add column preview_error text;

-- -----------------------------------------------------------------------------
-- 專案頁面內容：自動儲存用，只更新本文；版本不符代表他人已先儲存
-- -----------------------------------------------------------------------------
create or replace function public.save_project_content(p_id uuid, p_content text, p_version integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
begin
  if length(p_content) > 200000 then
    raise exception 'contentTooLong' using errcode = '22023';
  end if;
  update public.projects
     set content = p_content, content_version = content_version + 1
   where id = p_id and content_version = p_version
  returning content_version into v_version;
  if found then
    return v_version;
  end if;
  if public.can_edit_project(p_id) and exists (select 1 from public.projects where id = p_id) then
    raise exception 'conflict' using errcode = '40001';
  end if;
  raise exception 'noPermission' using errcode = '42501';
end;
$$;

-- -----------------------------------------------------------------------------
-- 附件列表
-- -----------------------------------------------------------------------------
create or replace function public.list_attachments(p_entity_type text, p_entity_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'kind', a.kind, 'title', coalesce(a.title, a.file_name), 'file_name', a.file_name,
           'mime_type', a.mime_type, 'size_bytes', a.size_bytes, 'storage_path', a.storage_path,
           'preview_path', a.preview_path, 'preview_error', a.preview_error, 'created_at', a.created_at,
           'uploaded_by', public.member_brief(a.uploaded_by),
           'deletable', public.is_admin() or (public.is_editor() and a.uploaded_by = public.current_member_id())
         ) order by a.created_at desc), '[]'::jsonb)
    from public.attachments a
   where a.entity_type = p_entity_type and a.entity_id = p_entity_id;
$$;

-- get_project 加上本文與版本
create or replace function public.get_project(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.project_json(p) || jsonb_build_object(
    'content', p.content,
    'content_version', p.content_version,
    'tasks', public.list_tasks(jsonb_build_object('project_id', p.id)),
    'publications', public.list_publications(jsonb_build_object('project_id', p.id)),
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object('id', mt.id, 'title', mt.title, 'emoji', mt.emoji,
                                          'type', mt.type, 'starts_at', mt.starts_at)
                       order by mt.starts_at desc)
        from public.meeting_projects mp join public.meetings mt on mt.id = mp.meeting_id
       where mp.project_id = p.id), '[]'::jsonb),
    'files', public.list_attachments('project', p.id)
  )
    from public.projects p where p.id = p_id;
$$;

-- -----------------------------------------------------------------------------
-- 活動紀錄：截短長文字、合併連續修改
-- -----------------------------------------------------------------------------
create or replace function public.activity_value(p jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p) = 'string' and length(p #>> '{}') > 300 then to_jsonb(left(p #>> '{}', 300) || '…')
    else p
  end;
$$;

create or replace function public.log_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_entity_type text := tg_argv[0];
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_actor uuid := public.current_member_id();
  v_changes jsonb;
  v_recent bigint;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', public.activity_value(v_old -> n.key),
                                                      'new', public.activity_value(n.value)))
      into v_changes
      from jsonb_each(v_new) n
     where n.key not in ('updated_at', 'updated_by', 'position', 'sort_order', 'content_version')
       and n.value is distinct from v_old -> n.key;
    -- 只有排序或時間戳變動時不記錄
    if v_changes is null then
      return new;
    end if;

    -- 同一人 10 分鐘內再次修改同一筆：合併到上一筆（保留最早的 old、最新的 new）
    if v_actor is not null then
      select l.id into v_recent
        from public.activity_log l
       where l.entity_type = v_entity_type and l.entity_id = (v_row ->> 'id')::uuid
         and l.actor_id = v_actor and l.action = 'update'
         and l.created_at > now() - interval '10 minutes'
       order by l.created_at desc
       limit 1;
      if v_recent is not null then
        update public.activity_log l
           set changes = coalesce(l.changes, '{}'::jsonb) || (
                 select jsonb_object_agg(c.key, jsonb_build_object(
                          'old', coalesce(l.changes -> c.key -> 'old', c.value -> 'old'),
                          'new', c.value -> 'new'))
                   from jsonb_each(v_changes) c),
               entity_title = coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'question', l.entity_title),
               created_at = now()
         where l.id = v_recent;
        return new;
      end if;
    end if;
  end if;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, entity_title, changes)
  values (
    v_actor,
    lower(tg_op),
    v_entity_type,
    (v_row ->> 'id')::uuid,
    coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'question', v_row ->> 'content'),
    v_changes
  );

  return coalesce(new, old);
end;
$$;

revoke execute on function public.list_attachments(text, uuid), public.save_project_content(uuid, text, integer)
  from public, anon;
grant execute on function public.list_attachments(text, uuid), public.save_project_content(uuid, text, integer)
  to authenticated;
