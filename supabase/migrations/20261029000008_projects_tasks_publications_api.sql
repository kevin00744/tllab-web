-- =============================================================================
-- TL Lab Hub — 08 專案／任務／論文 API（階段 4）
-- -----------------------------------------------------------------------------
-- 網頁透過這些函式讀寫資料：一次往返取回關聯資料，並以 security invoker 執行，
-- 讀寫權限仍完全由 RLS 決定。錯誤碼：
--   42501 沒有權限　22023 輸入不正確（message 為欄位或規則的 key）　P0002 找不到
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 共用：成員精簡資料、可刪除判斷（與 RLS delete policy 一致）
-- -----------------------------------------------------------------------------
create or replace function public.member_brief(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'name', m.name, 'avatar_url', m.avatar_url)
    from public.members m where m.id = p_id;
$$;

create or replace function public.can_delete_project(p_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (public.is_editor() and exists (
    select 1 from public.projects p
     where p.id = p_id
       and (p.owner_id = public.current_member_id() or p.created_by = public.current_member_id())));
$$;

create or replace function public.can_delete_task(p_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (public.is_editor() and exists (
    select 1 from public.tasks t
     where t.id = p_id
       and (t.created_by = public.current_member_id()
            or (t.project_id is not null and public.can_edit_project(t.project_id)))));
$$;

create or replace function public.can_delete_publication(p_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (public.is_editor() and exists (
    select 1 from public.publications pb
     where pb.id = p_id and pb.created_by = public.current_member_id()));
$$;

-- 使用者輸入的搜尋字詞轉成 ILIKE 樣式（跳脫 % _ \\）
create or replace function public.like_pattern(p_q text)
returns text
language sql immutable
set search_path = ''
as $$
  select '%' || replace(replace(replace(coalesce(p_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';
$$;

-- 表單下拉選單：成員、專案、論文
create or replace function public.form_options()
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'avatar_url', m.avatar_url,
                                          'position', m.position, 'is_alumni', m.is_alumni)
                       order by m.is_alumni, m.sort_order, m.name)
        from public.members m), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji, 'status', p.status)
                       order by p.status = 'completed', p.title)
        from public.projects p), '[]'::jsonb),
    'publications', coalesce((
      select jsonb_agg(jsonb_build_object('id', pb.id, 'title', pb.title, 'stage', pb.stage)
                       order by pb.stage in ('accepted', 'published'), pb.title)
        from public.publications pb), '[]'::jsonb),
    'can_create', public.is_editor()
  );
$$;

-- -----------------------------------------------------------------------------
-- 專案
-- -----------------------------------------------------------------------------
create or replace function public.project_json(p public.projects)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'title', p.title, 'emoji', p.emoji, 'description', p.description,
    'status', p.status, 'start_date', p.start_date, 'due_date', p.due_date,
    'progress', p.progress, 'tags', to_jsonb(p.tags), 'color', p.color,
    'updated_at', p.updated_at,
    'owner', public.member_brief(p.owner_id),
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'avatar_url', m.avatar_url, 'role', pm.role)
                       order by m.sort_order, m.name)
        from public.project_members pm join public.members m on m.id = pm.member_id
       where pm.project_id = p.id), '[]'::jsonb),
    'task_total', (select count(*) from public.tasks t where t.project_id = p.id),
    'task_done', (select count(*) from public.tasks t where t.project_id = p.id and t.status = 'done'),
    'task_overdue', (select count(*) from public.tasks t
                      where t.project_id = p.id and t.status <> 'done' and t.due_date < public.lab_today()),
    'publication_count', (select count(*) from public.publications pb where pb.project_id = p.id),
    'editable', public.can_edit_project(p.id),
    'deletable', public.can_delete_project(p.id)
  );
$$;

create or replace function public.list_projects(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.project_json(p)
                            order by array_position(array['active', 'planning', 'paused', 'completed']::public.project_status[], p.status),
                                     p.due_date nulls last, p.title), '[]'::jsonb)
    from public.projects p
   where (p_filter ->> 'status' is null or p.status::text = p_filter ->> 'status')
     and (p_filter ->> 'member_id' is null
          or p.owner_id = (p_filter ->> 'member_id')::uuid
          or exists (select 1 from public.project_members pm
                      where pm.project_id = p.id and pm.member_id = (p_filter ->> 'member_id')::uuid))
     and (coalesce(p_filter ->> 'q', '') = ''
          or p.title ilike public.like_pattern(p_filter ->> 'q')
          or array_to_string(p.tags, ' ') ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.save_project(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
  v_start date := nullif(p ->> 'start_date', '')::date;
  v_due date := nullif(p ->> 'due_date', '')::date;
  v_progress int := coalesce(nullif(p ->> 'progress', '')::int, 0);
  v_tags text[] := coalesce((select array_agg(distinct trim(x)) from jsonb_array_elements_text(coalesce(p -> 'tags', '[]')) x
                              where trim(x) <> ''), '{}');
begin
  if v_title = '' then raise exception 'titleRequired' using errcode = '22023'; end if;
  if v_progress not between 0 and 100 then raise exception 'progressRange' using errcode = '22023'; end if;
  if v_start is not null and v_due is not null and v_due < v_start then
    raise exception 'dateOrder' using errcode = '22023';
  end if;

  if v_id is null then
    insert into public.projects (title, emoji, description, owner_id, status, start_date, due_date, progress, tags)
    values (v_title, coalesce(nullif(p ->> 'emoji', ''), '📁'), nullif(p ->> 'description', ''),
            nullif(p ->> 'owner_id', '')::uuid, coalesce(nullif(p ->> 'status', ''), 'planning')::public.project_status,
            v_start, v_due, v_progress, v_tags)
    returning id into v_id;
  else
    update public.projects
       set title = v_title,
           emoji = coalesce(nullif(p ->> 'emoji', ''), emoji),
           description = nullif(p ->> 'description', ''),
           owner_id = nullif(p ->> 'owner_id', '')::uuid,
           status = coalesce(nullif(p ->> 'status', ''), status::text)::public.project_status,
           start_date = v_start, due_date = v_due, progress = v_progress, tags = v_tags
     where id = v_id;
    if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  end if;

  -- 參與成員：以傳入清單為準
  -- 先新增再刪除：若編輯權來自「自己是參與成員」，中途移除自己也不會失去權限
  if p ? 'member_ids' then
    insert into public.project_members (project_id, member_id)
    select v_id, x::uuid from jsonb_array_elements_text(p -> 'member_ids') x
    on conflict do nothing;
    delete from public.project_members
     where project_id = v_id
       and member_id not in (select x::uuid from jsonb_array_elements_text(p -> 'member_ids') x);
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_project(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.projects where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 任務
-- -----------------------------------------------------------------------------
create or replace function public.task_json(t public.tasks)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id, 'title', t.title, 'description', t.description,
    'status', t.status, 'priority', t.priority, 'due_date', t.due_date,
    'position', t.position, 'completed_at', t.completed_at, 'created_at', t.created_at,
    'overdue', t.status <> 'done' and t.due_date < public.lab_today(),
    'project', (select jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji)
                  from public.projects p where p.id = t.project_id),
    'publication', (select jsonb_build_object('id', pb.id, 'title', pb.title)
                      from public.publications pb where pb.id = t.publication_id),
    'meeting', (select jsonb_build_object('id', mt.id, 'title', mt.title)
                  from public.meetings mt where mt.id = t.meeting_id),
    'assignees', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'avatar_url', m.avatar_url)
                       order by m.sort_order, m.name)
        from public.task_assignees ta join public.members m on m.id = ta.member_id
       where ta.task_id = t.id), '[]'::jsonb),
    'created_by', public.member_brief(t.created_by),
    'editable', public.can_edit_task(t.id),
    'deletable', public.can_delete_task(t.id)
  );
$$;

-- 篩選：mine / member_id / project_id / overdue / status / q / due_from / due_to
create or replace function public.list_tasks(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.task_json(t)
                            order by array_position(array['todo', 'in_progress', 'in_review', 'done']::public.task_status[], t.status),
                                     t.position, t.created_at), '[]'::jsonb)
    from public.tasks t
   where (coalesce((p_filter ->> 'mine')::boolean, false) = false
          or exists (select 1 from public.task_assignees ta
                      where ta.task_id = t.id and ta.member_id = public.current_member_id()))
     and (p_filter ->> 'member_id' is null
          or exists (select 1 from public.task_assignees ta
                      where ta.task_id = t.id and ta.member_id = (p_filter ->> 'member_id')::uuid))
     and (p_filter ->> 'project_id' is null or t.project_id = (p_filter ->> 'project_id')::uuid)
     and (coalesce((p_filter ->> 'overdue')::boolean, false) = false
          or (t.status <> 'done' and t.due_date < public.lab_today()))
     and (p_filter ->> 'status' is null or t.status::text = p_filter ->> 'status')
     and (p_filter ->> 'due_from' is null or t.due_date >= (p_filter ->> 'due_from')::date)
     and (p_filter ->> 'due_to' is null or t.due_date <= (p_filter ->> 'due_to')::date)
     and (coalesce(p_filter ->> 'q', '') = '' or t.title ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.save_task(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
  v_status public.task_status := coalesce(nullif(p ->> 'status', ''), 'todo')::public.task_status;
begin
  if v_title = '' then raise exception 'titleRequired' using errcode = '22023'; end if;

  if v_id is null then
    insert into public.tasks (title, description, project_id, publication_id, priority, status, due_date, position)
    values (v_title, nullif(p ->> 'description', ''), nullif(p ->> 'project_id', '')::uuid,
            nullif(p ->> 'publication_id', '')::uuid,
            coalesce(nullif(p ->> 'priority', ''), 'medium')::public.task_priority, v_status,
            nullif(p ->> 'due_date', '')::date,
            coalesce((select max(position) from public.tasks where status = v_status), 0) + 1)
    returning id into v_id;
  else
    update public.tasks
       set title = v_title,
           description = nullif(p ->> 'description', ''),
           project_id = nullif(p ->> 'project_id', '')::uuid,
           publication_id = nullif(p ->> 'publication_id', '')::uuid,
           priority = coalesce(nullif(p ->> 'priority', ''), priority::text)::public.task_priority,
           status = v_status,
           due_date = nullif(p ->> 'due_date', '')::date
     where id = v_id;
    if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  end if;

  -- 先新增再刪除（同 save_project）
  if p ? 'assignee_ids' then
    insert into public.task_assignees (task_id, member_id)
    select v_id, x::uuid from jsonb_array_elements_text(p -> 'assignee_ids') x
    on conflict do nothing;
    delete from public.task_assignees
     where task_id = v_id
       and member_id not in (select x::uuid from jsonb_array_elements_text(p -> 'assignee_ids') x);
  end if;
  return v_id;
end;
$$;

-- 看板拖拉：新狀態與位置（位置由前端以前後兩張卡片的中間值計算）
create or replace function public.move_task(p_id uuid, p_status public.task_status, p_position double precision)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  update public.tasks set status = p_status, position = p_position
   where id = p_id
  returning * into v_task;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  return public.task_json(v_task);
end;
$$;

create or replace function public.delete_task(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.tasks where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 論文
-- -----------------------------------------------------------------------------
create or replace function public.publication_json(pb public.publications)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', pb.id, 'title', pb.title, 'emoji', pb.emoji, 'type', pb.type, 'stage', pb.stage,
    'venue', pb.venue, 'submitted_at', pb.submitted_at, 'deadline', pb.deadline,
    'accepted_at', pb.accepted_at, 'published_at', pb.published_at,
    'doi', pb.doi, 'url', pb.url, 'abstract', pb.abstract, 'notes', pb.notes,
    'updated_at', pb.updated_at,
    'project', (select jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji)
                  from public.projects p where p.id = pb.project_id),
    'authors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', pa.member_id,
               'name', coalesce(pa.display_name, m.name),
               'display_name', pa.display_name,
               'is_first_author', pa.is_first_author,
               'is_corresponding', pa.is_corresponding) order by pa.author_order)
        from public.publication_authors pa left join public.members m on m.id = pa.member_id
       where pa.publication_id = pb.id), '[]'::jsonb),
    'editable', public.can_edit_publication(pb.id),
    'deletable', public.can_delete_publication(pb.id)
  );
$$;

-- 篩選：stage / type / project_id / member_id（作者）/ year（發表年）/ q
create or replace function public.list_publications(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.publication_json(pb)
                            order by array_position(array['idea', 'drafting', 'submitted', 'revision', 'accepted', 'published']::public.publication_stage[], pb.stage),
                                     coalesce(pb.published_at, pb.accepted_at, pb.submitted_at, pb.deadline) desc nulls last,
                                     pb.title), '[]'::jsonb)
    from public.publications pb
   where (p_filter ->> 'stage' is null or pb.stage::text = p_filter ->> 'stage')
     and (p_filter ->> 'type' is null or pb.type::text = p_filter ->> 'type')
     and (p_filter ->> 'project_id' is null or pb.project_id = (p_filter ->> 'project_id')::uuid)
     and (p_filter ->> 'member_id' is null
          or exists (select 1 from public.publication_authors pa
                      where pa.publication_id = pb.id and pa.member_id = (p_filter ->> 'member_id')::uuid))
     and (p_filter ->> 'year' is null or extract(year from pb.published_at) = (p_filter ->> 'year')::int)
     and (coalesce(p_filter ->> 'q', '') = ''
          or pb.title ilike public.like_pattern(p_filter ->> 'q')
          or pb.venue ilike public.like_pattern(p_filter ->> 'q')
          or pb.doi ilike public.like_pattern(p_filter ->> 'q'));
$$;

-- 專案詳細頁：專案＋底下的任務、論文、會議紀錄
create or replace function public.get_project(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.project_json(p) || jsonb_build_object(
    'tasks', public.list_tasks(jsonb_build_object('project_id', p.id)),
    'publications', public.list_publications(jsonb_build_object('project_id', p.id)),
    'meetings', coalesce((
      select jsonb_agg(jsonb_build_object('id', mt.id, 'title', mt.title, 'emoji', mt.emoji,
                                          'type', mt.type, 'starts_at', mt.starts_at)
                       order by mt.starts_at desc)
        from public.meeting_projects mp join public.meetings mt on mt.id = mp.meeting_id
       where mp.project_id = p.id), '[]'::jsonb)
  )
    from public.projects p where p.id = p_id;
$$;

create or replace function public.save_publication(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
  v_author jsonb;
  v_order int := 0;
  v_old uuid[];
begin
  if v_title = '' then raise exception 'titleRequired' using errcode = '22023'; end if;

  if v_id is null then
    insert into public.publications (title, emoji, type, stage, venue, project_id, submitted_at, deadline,
                                     accepted_at, published_at, doi, url, abstract, notes)
    values (v_title, coalesce(nullif(p ->> 'emoji', ''), '📄'),
            coalesce(nullif(p ->> 'type', ''), 'journal')::public.publication_type,
            coalesce(nullif(p ->> 'stage', ''), 'idea')::public.publication_stage,
            nullif(trim(p ->> 'venue'), ''), nullif(p ->> 'project_id', '')::uuid,
            nullif(p ->> 'submitted_at', '')::date, nullif(p ->> 'deadline', '')::date,
            nullif(p ->> 'accepted_at', '')::date, nullif(p ->> 'published_at', '')::date,
            nullif(trim(p ->> 'doi'), ''), nullif(trim(p ->> 'url'), ''),
            nullif(p ->> 'abstract', ''), nullif(p ->> 'notes', ''))
    returning id into v_id;
  else
    update public.publications
       set title = v_title,
           emoji = coalesce(nullif(p ->> 'emoji', ''), emoji),
           type = coalesce(nullif(p ->> 'type', ''), type::text)::public.publication_type,
           stage = coalesce(nullif(p ->> 'stage', ''), stage::text)::public.publication_stage,
           venue = nullif(trim(p ->> 'venue'), ''),
           project_id = nullif(p ->> 'project_id', '')::uuid,
           submitted_at = nullif(p ->> 'submitted_at', '')::date,
           deadline = nullif(p ->> 'deadline', '')::date,
           accepted_at = nullif(p ->> 'accepted_at', '')::date,
           published_at = nullif(p ->> 'published_at', '')::date,
           doi = nullif(trim(p ->> 'doi'), ''),
           url = nullif(trim(p ->> 'url'), ''),
           abstract = nullif(p ->> 'abstract', ''),
           notes = nullif(p ->> 'notes', '')
     where id = v_id;
    if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  end if;

  -- 作者：依陣列順序重建。先新增再刪除舊資料（author_order 唯一限制為 deferred），
  -- 若編輯權來自「自己是作者」也不會中途失去權限
  if p ? 'authors' then
    select coalesce(array_agg(id), '{}') into v_old from public.publication_authors where publication_id = v_id;
    for v_author in select * from jsonb_array_elements(p -> 'authors') loop
      if nullif(v_author ->> 'member_id', '') is null and trim(coalesce(v_author ->> 'display_name', '')) = '' then
        continue;
      end if;
      v_order := v_order + 1;
      insert into public.publication_authors
        (publication_id, member_id, display_name, author_order, is_first_author, is_corresponding)
      values (v_id, nullif(v_author ->> 'member_id', '')::uuid,
              nullif(trim(v_author ->> 'display_name'), ''), v_order,
              coalesce((v_author ->> 'is_first_author')::boolean, v_order = 1),
              coalesce((v_author ->> 'is_corresponding')::boolean, false));
    end loop;
    delete from public.publication_authors where id = any(v_old);
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_publication(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.publications where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- 年度統計：各年已發表數（依類型）與投稿數
create or replace function public.publication_year_stats()
returns jsonb
language sql stable
set search_path = ''
as $$
  with years as (
    select extract(year from published_at)::int as y from public.publications where stage = 'published' and published_at is not null
    union
    select extract(year from submitted_at)::int from public.publications where submitted_at is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'year', y.y,
           'journal', (select count(*) from public.publications where stage = 'published' and type = 'journal' and extract(year from published_at) = y.y),
           'conference', (select count(*) from public.publications where stage = 'published' and type = 'conference' and extract(year from published_at) = y.y),
           'preprint', (select count(*) from public.publications where stage = 'published' and type = 'preprint' and extract(year from published_at) = y.y),
           'thesis', (select count(*) from public.publications where stage = 'published' and type = 'thesis' and extract(year from published_at) = y.y),
           'submitted', (select count(*) from public.publications where extract(year from submitted_at) = y.y)
         ) order by y.y), '[]'::jsonb)
    from years y where y.y is not null;
$$;

-- -----------------------------------------------------------------------------
-- 權限：只有登入者可呼叫
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'member_brief(uuid)', 'like_pattern(text)', 'can_delete_project(uuid)', 'can_delete_task(uuid)', 'can_delete_publication(uuid)',
    'form_options()', 'project_json(public.projects)', 'list_projects(jsonb)', 'get_project(uuid)',
    'save_project(jsonb)', 'delete_project(uuid)', 'task_json(public.tasks)', 'list_tasks(jsonb)',
    'save_task(jsonb)', 'move_task(uuid, public.task_status, double precision)', 'delete_task(uuid)',
    'publication_json(public.publications)', 'list_publications(jsonb)', 'save_publication(jsonb)',
    'delete_publication(uuid)', 'publication_year_stats()']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
