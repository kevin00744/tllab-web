-- =============================================================================
-- TL Lab Hub — 13 Resources API（階段 6）
-- -----------------------------------------------------------------------------
-- Orientation Guide（documents）、FAQ、軟體與工具、Pipelines、會議紀錄
-- * 一律 security invoker：權限由 RLS 決定（migration 02）
-- * 錯誤碼同 migration 08：42501 沒有權限、22023 輸入不正確、40001 版本衝突
-- * documents.content 與 meetings.summary 為類 Notion 即時編輯，附版本號避免互相覆蓋
-- =============================================================================

alter table public.documents add column if not exists content_version integer not null default 0;
alter table public.meetings  add column if not exists summary_version integer not null default 0;

-- 只有 Admin 或建立者可刪除（documents / faqs / software_tools / pipelines / meetings 共用）
create or replace function public.can_delete_own(p_created_by uuid)
returns boolean
language sql stable
set search_path = ''
as $$
  select public.is_admin() or (public.is_editor() and p_created_by = public.current_member_id());
$$;

create or replace function public.clean_tags(p jsonb)
returns text[]
language sql immutable
set search_path = ''
as $$
  select coalesce((select array_agg(distinct trim(x)) from jsonb_array_elements_text(coalesce(p, '[]')) x
                    where trim(x) <> ''), '{}');
$$;

-- 只接受 http(s) 網址，其餘視為空白
create or replace function public.clean_url(p text)
returns text
language sql immutable
set search_path = ''
as $$
  select case when trim(coalesce(p, '')) ~* '^https?://\S+$' then trim(p) end;
$$;

-- =============================================================================
-- Orientation Guide
-- =============================================================================
create or replace function public.document_json(d public.documents)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', d.id, 'kind', d.kind, 'parent_id', d.parent_id, 'slug', d.slug, 'title', d.title, 'emoji', d.emoji,
    'sort_order', d.sort_order, 'updated_at', d.updated_at, 'updated_by', public.member_brief(d.updated_by),
    'editable', public.is_editor(), 'deletable', public.can_delete_own(d.created_by)
  );
$$;

-- 目錄（不含內文），依 sort_order 排序；前端組成樹狀
create or replace function public.list_documents(p_kind public.document_kind default 'orientation')
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.document_json(d) order by d.sort_order, d.title), '[]'::jsonb)
    from public.documents d where d.kind = p_kind;
$$;

create or replace function public.get_document(p_slug text)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.document_json(d) || jsonb_build_object('content', d.content, 'content_version', d.content_version)
    from public.documents d where d.slug = p_slug;
$$;

-- 網址代稱：英數標題轉成 a-b-c；中文等其他標題使用 page-xxxxxx
create or replace function public.document_slug(p_title text, p_id uuid default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g'));
  v_slug text;
  i int := 1;
begin
  if length(v_base) < 2 then
    v_base := 'page-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  end if;
  v_base := left(v_base, 60);
  v_slug := v_base;
  while exists (select 1 from public.documents where slug = v_slug and id is distinct from p_id) loop
    i := i + 1;
    v_slug := v_base || '-' || i;
  end loop;
  return v_slug;
end;
$$;

create or replace function public.save_document(p jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
  v_parent uuid := nullif(p ->> 'parent_id', '')::uuid;
  v_slug text := nullif(lower(trim(coalesce(p ->> 'slug', ''))), '');
begin
  if v_title = '' then raise exception 'titleRequired' using errcode = '22023'; end if;
  if v_slug is not null and v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    raise exception 'slugInvalid' using errcode = '22023';
  end if;
  if v_slug is not null and exists (select 1 from public.documents where slug = v_slug and id is distinct from v_id) then
    raise exception 'slugTaken' using errcode = '22023';
  end if;
  -- 上層不能是自己或自己的子頁面
  if v_id is not null and v_parent is not null and exists (
       with recursive up as (
         select id, parent_id from public.documents where id = v_parent
         union all
         select d.id, d.parent_id from public.documents d join up on d.id = up.parent_id
       ) select 1 from up where id = v_id) then
    raise exception 'invalidParent' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.documents (kind, parent_id, slug, title, emoji, content, sort_order)
    values (coalesce(nullif(p ->> 'kind', ''), 'orientation')::public.document_kind, v_parent,
            coalesce(v_slug, public.document_slug(v_title)), v_title, coalesce(nullif(p ->> 'emoji', ''), '📘'),
            coalesce(p ->> 'content', ''),
            coalesce(nullif(p ->> 'sort_order', '')::int,
                     (select coalesce(max(sort_order), 0) + 1 from public.documents where parent_id is not distinct from v_parent)))
    returning slug into v_slug;
    return v_slug;
  end if;

  update public.documents
     set title = v_title, parent_id = v_parent,
         emoji = coalesce(nullif(p ->> 'emoji', ''), emoji),
         slug = coalesce(v_slug, slug),
         sort_order = coalesce(nullif(p ->> 'sort_order', '')::int, sort_order),
         updated_by = public.current_member_id()
   where id = v_id
  returning slug into v_slug;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  return v_slug;
end;
$$;

create or replace function public.save_document_content(p_id uuid, p_content text, p_version integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
begin
  if length(p_content) > 200000 then raise exception 'contentTooLong' using errcode = '22023'; end if;
  update public.documents
     set content = p_content, content_version = content_version + 1, updated_by = public.current_member_id()
   where id = p_id and content_version = p_version
  returning content_version into v_version;
  if found then return v_version; end if;
  if public.is_editor() and exists (select 1 from public.documents where id = p_id) then
    raise exception 'conflict' using errcode = '40001';
  end if;
  raise exception 'noPermission' using errcode = '42501';
end;
$$;

create or replace function public.delete_document(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.documents where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- =============================================================================
-- FAQ
-- =============================================================================
create or replace function public.faq_json(f public.faqs)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', f.id, 'question', f.question, 'answer', f.answer, 'category', f.category, 'tags', to_jsonb(f.tags),
    'sort_order', f.sort_order, 'updated_at', f.updated_at,
    'editable', public.is_editor(), 'deletable', public.can_delete_own(f.created_by)
  );
$$;

-- 篩選：category、q（問題、答案、標籤）
create or replace function public.list_faqs(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.faq_json(f) order by f.category, f.sort_order, f.question), '[]'::jsonb)
    from public.faqs f
   where (p_filter ->> 'category' is null or f.category = p_filter ->> 'category')
     and (coalesce(p_filter ->> 'q', '') = ''
          or f.question ilike public.like_pattern(p_filter ->> 'q')
          or f.answer ilike public.like_pattern(p_filter ->> 'q')
          or array_to_string(f.tags, ' ') ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.faq_categories()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', category, 'count', n) order by category), '[]'::jsonb)
    from (select category, count(*) n from public.faqs group by category) c;
$$;

create or replace function public.save_faq(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_q text := trim(coalesce(p ->> 'question', ''));
  v_cat text := coalesce(nullif(trim(coalesce(p ->> 'category', '')), ''), '一般');
begin
  if v_q = '' then raise exception 'titleRequired' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.faqs (question, answer, category, tags, sort_order)
    values (v_q, coalesce(p ->> 'answer', ''), v_cat, public.clean_tags(p -> 'tags'),
            coalesce(nullif(p ->> 'sort_order', '')::int,
                     (select coalesce(max(sort_order), 0) + 1 from public.faqs where category = v_cat)))
    returning id into v_id;
    return v_id;
  end if;
  update public.faqs
     set question = v_q, answer = coalesce(p ->> 'answer', ''), category = v_cat, tags = public.clean_tags(p -> 'tags'),
         sort_order = coalesce(nullif(p ->> 'sort_order', '')::int, sort_order)
   where id = v_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  return v_id;
end;
$$;

create or replace function public.delete_faq(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.faqs where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- =============================================================================
-- 軟體與工具
-- =============================================================================
create or replace function public.software_json(s public.software_tools)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'name', s.name, 'emoji', s.emoji, 'category', s.category, 'purpose', s.purpose,
    'access_info', s.access_info, 'install_guide', s.install_guide, 'url', s.url, 'docs_url', s.docs_url,
    'contact', public.member_brief(s.contact_id), 'updated_at', s.updated_at,
    'editable', public.is_editor(), 'deletable', public.can_delete_own(s.created_by)
  );
$$;

create or replace function public.list_software(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.software_json(s) order by s.category, s.name), '[]'::jsonb)
    from public.software_tools s
   where (p_filter ->> 'category' is null or s.category = p_filter ->> 'category')
     and (coalesce(p_filter ->> 'q', '') = ''
          or s.name ilike public.like_pattern(p_filter ->> 'q')
          or s.purpose ilike public.like_pattern(p_filter ->> 'q')
          or s.category ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.get_software(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.software_json(s) from public.software_tools s where s.id = p_id;
$$;

create or replace function public.save_software(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := trim(coalesce(p ->> 'name', ''));
  v_cat text := coalesce(nullif(trim(coalesce(p ->> 'category', '')), ''), '其他');
begin
  if v_name = '' then raise exception 'nameRequired' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.software_tools (name, emoji, category, purpose, access_info, install_guide, url, docs_url, contact_id)
    values (v_name, coalesce(nullif(p ->> 'emoji', ''), '🧰'), v_cat, nullif(trim(coalesce(p ->> 'purpose', '')), ''),
            nullif(p ->> 'access_info', ''), nullif(p ->> 'install_guide', ''),
            public.clean_url(p ->> 'url'), public.clean_url(p ->> 'docs_url'), nullif(p ->> 'contact_id', '')::uuid)
    returning id into v_id;
    return v_id;
  end if;
  update public.software_tools
     set name = v_name, emoji = coalesce(nullif(p ->> 'emoji', ''), emoji), category = v_cat,
         purpose = nullif(trim(coalesce(p ->> 'purpose', '')), ''),
         access_info = nullif(p ->> 'access_info', ''), install_guide = nullif(p ->> 'install_guide', ''),
         url = public.clean_url(p ->> 'url'), docs_url = public.clean_url(p ->> 'docs_url'),
         contact_id = nullif(p ->> 'contact_id', '')::uuid
   where id = v_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  return v_id;
end;
$$;

create or replace function public.delete_software(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.software_tools where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- =============================================================================
-- Pipelines
-- =============================================================================
create or replace function public.pipeline_json(pl public.pipelines)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', pl.id, 'name', pl.name, 'emoji', pl.emoji, 'description', pl.description,
    'inputs', pl.inputs, 'outputs', pl.outputs, 'version', pl.version, 'repo_url', pl.repo_url, 'tags', to_jsonb(pl.tags),
    'maintainer', public.member_brief(pl.maintainer_id),
    'project', (select jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji)
                  from public.projects p where p.id = pl.project_id),
    'step_count', (select count(*) from public.pipeline_steps s where s.pipeline_id = pl.id),
    'updated_at', pl.updated_at,
    'editable', public.can_edit_pipeline(pl.id), 'deletable', public.can_delete_own(pl.created_by)
  );
$$;

create or replace function public.list_pipelines(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.pipeline_json(pl) order by pl.name), '[]'::jsonb)
    from public.pipelines pl
   where (p_filter ->> 'tag' is null or (p_filter ->> 'tag') = any (pl.tags))
     and (coalesce(p_filter ->> 'q', '') = ''
          or pl.name ilike public.like_pattern(p_filter ->> 'q')
          or pl.description ilike public.like_pattern(p_filter ->> 'q')
          or array_to_string(pl.tags, ' ') ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.get_pipeline(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.pipeline_json(pl) || jsonb_build_object(
    'steps', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'title', s.title, 'description', s.description,
                                                           'code', s.code, 'code_language', s.code_language)
                                        order by s.step_order)
                         from public.pipeline_steps s where s.pipeline_id = pl.id), '[]'::jsonb))
    from public.pipelines pl where pl.id = p_id;
$$;

-- 步驟以傳入清單為準（依陣列順序重新編號）
create or replace function public.save_pipeline(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_name text := trim(coalesce(p ->> 'name', ''));
begin
  if v_name = '' then raise exception 'nameRequired' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p -> 'steps', '[]')) s where trim(coalesce(s ->> 'title', '')) = '') then
    raise exception 'titleRequired' using errcode = '22023';
  end if;
  if v_id is null then
    insert into public.pipelines (name, emoji, description, inputs, outputs, version, maintainer_id, project_id, repo_url, tags)
    values (v_name, coalesce(nullif(p ->> 'emoji', ''), '🔬'), nullif(p ->> 'description', ''),
            nullif(p ->> 'inputs', ''), nullif(p ->> 'outputs', ''),
            coalesce(nullif(trim(coalesce(p ->> 'version', '')), ''), '1.0.0'),
            nullif(p ->> 'maintainer_id', '')::uuid, nullif(p ->> 'project_id', '')::uuid,
            public.clean_url(p ->> 'repo_url'), public.clean_tags(p -> 'tags'))
    returning id into v_id;
  else
    update public.pipelines
       set name = v_name, emoji = coalesce(nullif(p ->> 'emoji', ''), emoji), description = nullif(p ->> 'description', ''),
           inputs = nullif(p ->> 'inputs', ''), outputs = nullif(p ->> 'outputs', ''),
           version = coalesce(nullif(trim(coalesce(p ->> 'version', '')), ''), version),
           maintainer_id = nullif(p ->> 'maintainer_id', '')::uuid, project_id = nullif(p ->> 'project_id', '')::uuid,
           repo_url = public.clean_url(p ->> 'repo_url'), tags = public.clean_tags(p -> 'tags')
     where id = v_id;
    if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  end if;

  if p ? 'steps' then
    delete from public.pipeline_steps where pipeline_id = v_id;
    insert into public.pipeline_steps (pipeline_id, step_order, title, description, code, code_language)
    select v_id, s.ord, trim(s.v ->> 'title'), nullif(s.v ->> 'description', ''), nullif(s.v ->> 'code', ''),
           nullif(lower(trim(coalesce(s.v ->> 'code_language', ''))), '')
      from jsonb_array_elements(p -> 'steps') with ordinality as s(v, ord);
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_pipeline(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.pipelines where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- =============================================================================
-- 會議紀錄
-- =============================================================================
create or replace function public.meeting_json(mt public.meetings)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', mt.id, 'title', mt.title, 'emoji', mt.emoji, 'type', mt.type,
    'starts_at', mt.starts_at, 'ends_at', mt.ends_at, 'location', mt.location,
    'attendees', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'avatar_url', m.avatar_url, 'is_presenter', ma.is_presenter)
                       order by ma.is_presenter desc, m.sort_order, m.name)
        from public.meeting_attendees ma join public.members m on m.id = ma.member_id
       where ma.meeting_id = mt.id), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji) order by p.title)
        from public.meeting_projects mp join public.projects p on p.id = mp.project_id
       where mp.meeting_id = mt.id), '[]'::jsonb),
    'action_total', (select count(*) from public.action_items a where a.meeting_id = mt.id),
    'action_open', (select count(*) from public.action_items a where a.meeting_id = mt.id and not a.is_done),
    'has_notes', coalesce(mt.summary, '') <> '' or coalesce(mt.decisions, '') <> '',
    'editable', public.can_edit_meeting(mt.id), 'deletable', public.can_delete_own(mt.created_by)
  );
$$;

-- 篩選：type、member_id（出席）、project_id、q（標題、紀錄內容）、when（upcoming / past）
create or replace function public.list_meetings(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.meeting_json(mt) order by mt.starts_at desc), '[]'::jsonb)
    from public.meetings mt
   where (p_filter ->> 'type' is null or mt.type::text = p_filter ->> 'type')
     and (p_filter ->> 'member_id' is null or exists (
           select 1 from public.meeting_attendees ma where ma.meeting_id = mt.id and ma.member_id = (p_filter ->> 'member_id')::uuid))
     and (p_filter ->> 'project_id' is null or exists (
           select 1 from public.meeting_projects mp where mp.meeting_id = mt.id and mp.project_id = (p_filter ->> 'project_id')::uuid))
     and (coalesce(p_filter ->> 'q', '') = ''
          or mt.title ilike public.like_pattern(p_filter ->> 'q')
          or mt.summary ilike public.like_pattern(p_filter ->> 'q')
          or mt.decisions ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.action_item_json(a public.action_items)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'content', a.content, 'due_date', a.due_date, 'is_done', a.is_done, 'position', a.position,
    'assignee', public.member_brief(a.assignee_id),
    'task', (select jsonb_build_object('id', t.id, 'title', t.title, 'status', t.status) from public.tasks t where t.id = a.task_id),
    'overdue', not a.is_done and a.due_date < public.lab_today(),
    'editable', public.can_edit_meeting(a.meeting_id)
                or (public.is_editor() and a.assignee_id = public.current_member_id())
  );
$$;

create or replace function public.get_meeting(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.meeting_json(mt) || jsonb_build_object(
    'summary', coalesce(mt.summary, ''), 'summary_version', mt.summary_version, 'decisions', mt.decisions,
    'action_items', coalesce((select jsonb_agg(public.action_item_json(a) order by a.position, a.created_at)
                                from public.action_items a where a.meeting_id = mt.id), '[]'::jsonb))
    from public.meetings mt where mt.id = p_id;
$$;

-- 出席者 attendees: [{member_id, is_presenter}]；相關專案 project_ids
create or replace function public.save_meeting(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
  v_start timestamptz := nullif(p ->> 'starts_at', '')::timestamptz;
  v_end timestamptz := nullif(p ->> 'ends_at', '')::timestamptz;
begin
  if v_title = '' then raise exception 'titleRequired' using errcode = '22023'; end if;
  if v_start is null then raise exception 'dateRequired' using errcode = '22023'; end if;
  if v_end is not null and v_end < v_start then raise exception 'dateOrder' using errcode = '22023'; end if;

  if v_id is null then
    insert into public.meetings (title, emoji, type, starts_at, ends_at, location, decisions)
    values (v_title, coalesce(nullif(p ->> 'emoji', ''), '🗓️'),
            coalesce(nullif(p ->> 'type', ''), 'lab_meeting')::public.meeting_type, v_start, v_end,
            nullif(trim(coalesce(p ->> 'location', '')), ''), nullif(p ->> 'decisions', ''))
    returning id into v_id;
  else
    update public.meetings
       set title = v_title, emoji = coalesce(nullif(p ->> 'emoji', ''), emoji),
           type = coalesce(nullif(p ->> 'type', ''), type::text)::public.meeting_type,
           starts_at = v_start, ends_at = v_end, location = nullif(trim(coalesce(p ->> 'location', '')), ''),
           decisions = nullif(p ->> 'decisions', '')
     where id = v_id;
    if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  end if;

  -- 先新增／更新再刪除：編輯權來自「自己是出席者」時，中途不會失去權限
  if p ? 'attendees' then
    insert into public.meeting_attendees (meeting_id, member_id, is_presenter)
    select v_id, (a ->> 'member_id')::uuid, coalesce((a ->> 'is_presenter')::boolean, false)
      from jsonb_array_elements(p -> 'attendees') a
    on conflict (meeting_id, member_id) do update set is_presenter = excluded.is_presenter;
    delete from public.meeting_attendees
     where meeting_id = v_id
       and member_id not in (select (a ->> 'member_id')::uuid from jsonb_array_elements(p -> 'attendees') a);
  end if;
  if p ? 'project_ids' then
    insert into public.meeting_projects (meeting_id, project_id)
    select v_id, x::uuid from jsonb_array_elements_text(p -> 'project_ids') x
    on conflict do nothing;
    delete from public.meeting_projects
     where meeting_id = v_id
       and project_id not in (select x::uuid from jsonb_array_elements_text(p -> 'project_ids') x);
  end if;
  return v_id;
end;
$$;

create or replace function public.save_meeting_summary(p_id uuid, p_content text, p_version integer)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_version integer;
begin
  if length(p_content) > 200000 then raise exception 'contentTooLong' using errcode = '22023'; end if;
  update public.meetings
     set summary = nullif(p_content, ''), summary_version = summary_version + 1
   where id = p_id and summary_version = p_version
  returning summary_version into v_version;
  if found then return v_version; end if;
  if public.can_edit_meeting(p_id) and exists (select 1 from public.meetings where id = p_id) then
    raise exception 'conflict' using errcode = '40001';
  end if;
  raise exception 'noPermission' using errcode = '42501';
end;
$$;

create or replace function public.delete_meeting(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.meetings where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- 新增或更新 action item；已轉為任務時，勾選完成會同步任務狀態（有權限時）
create or replace function public.save_action_item(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_content text := trim(coalesce(p ->> 'content', ''));
  v_item public.action_items;
begin
  if v_content = '' then raise exception 'titleRequired' using errcode = '22023'; end if;
  if v_id is null then
    insert into public.action_items (meeting_id, content, assignee_id, due_date, position)
    values ((p ->> 'meeting_id')::uuid, v_content, nullif(p ->> 'assignee_id', '')::uuid, nullif(p ->> 'due_date', '')::date,
            (select coalesce(max(position), 0) + 1 from public.action_items where meeting_id = (p ->> 'meeting_id')::uuid))
    returning id into v_id;
    return v_id;
  end if;

  update public.action_items a
     set content = v_content,
         assignee_id = case when p ? 'assignee_id' then nullif(p ->> 'assignee_id', '')::uuid else a.assignee_id end,
         due_date = case when p ? 'due_date' then nullif(p ->> 'due_date', '')::date else a.due_date end,
         is_done = coalesce((p ->> 'is_done')::boolean, a.is_done)
   where a.id = v_id
  returning * into v_item;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;

  if v_item.task_id is not null and p ? 'is_done' then
    update public.tasks
       set status = case when v_item.is_done then 'done'::public.task_status
                         when status = 'done' then 'todo'::public.task_status else status end
     where id = v_item.task_id and (status = 'done') is distinct from v_item.is_done;
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_action_item(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.action_items where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'can_delete_own(uuid)', 'clean_tags(jsonb)', 'clean_url(text)',
    'document_json(public.documents)', 'list_documents(public.document_kind)', 'get_document(text)',
    'document_slug(text, uuid)', 'save_document(jsonb)', 'save_document_content(uuid, text, integer)', 'delete_document(uuid)',
    'faq_json(public.faqs)', 'list_faqs(jsonb)', 'faq_categories()', 'save_faq(jsonb)', 'delete_faq(uuid)',
    'software_json(public.software_tools)', 'list_software(jsonb)', 'get_software(uuid)', 'save_software(jsonb)', 'delete_software(uuid)',
    'pipeline_json(public.pipelines)', 'list_pipelines(jsonb)', 'get_pipeline(uuid)', 'save_pipeline(jsonb)', 'delete_pipeline(uuid)',
    'meeting_json(public.meetings)', 'list_meetings(jsonb)', 'action_item_json(public.action_items)', 'get_meeting(uuid)',
    'save_meeting(jsonb)', 'save_meeting_summary(uuid, text, integer)', 'delete_meeting(uuid)',
    'save_action_item(jsonb)', 'delete_action_item(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
