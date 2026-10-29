-- =============================================================================
-- TL Lab Hub — 16 從 Notion 匯入（階段 8）
-- -----------------------------------------------------------------------------
-- import_notion(p)：網頁端把 Notion 匯出檔整理成 JSON（見 src/lib/notion/convert.ts），
-- 這裡在同一個交易中寫入；任何一筆失敗就全部不寫入。
-- * 以 notion_id 判斷是否已匯入：mode = 'skip' 略過已存在的資料，'update' 以 Notion 內容更新
-- * 人員以 key 對應：既有成員（existing_id）、或新增的成員（notion_id 為目錄頁 id 或 person:<姓名>）
-- * 僅 Admin 可執行；security invoker，權限仍由 RLS 把關
-- resolve_notion(id)：匯入內容中的 Notion 內部連結 /notion/<id> 導向對應頁面
-- =============================================================================

-- 修正 migration 13：截到 60 字後可能以連字號結尾，違反網址代稱格式
create or replace function public.document_slug(p_title text, p_id uuid default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := trim(both '-' from left(trim(both '-' from regexp_replace(lower(coalesce(p_title, '')), '[^a-z0-9]+', '-', 'g')), 60));
  v_slug text;
  i int := 1;
begin
  if length(v_base) < 2 then
    v_base := 'page-' || left(replace(gen_random_uuid()::text, '-', ''), 6);
  end if;
  v_slug := v_base;
  while exists (select 1 from public.documents where slug = v_slug and id is distinct from p_id) loop
    i := i + 1;
    v_slug := v_base || '-' || i;
  end loop;
  return v_slug;
end;
$$;

-- 統計：{"projects": {"created": n, "updated": n, "skipped": n}, ...}
create or replace function public.notion_stat_bump(s jsonb, p_entity text, p_outcome text)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_set(case when s ? p_entity then s else s || jsonb_build_object(p_entity, '{}'::jsonb) end,
                   array[p_entity, p_outcome],
                   to_jsonb(coalesce((s -> p_entity ->> p_outcome)::int, 0) + 1));
$$;

create or replace function public.import_notion(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_mode text := coalesce(nullif(p ->> 'mode', ''), 'skip');
  v_people jsonb := '{}'::jsonb;   -- key → member uuid
  v_projects jsonb := '{}'::jsonb; -- notion_id → project uuid
  v_docs jsonb := '{}'::jsonb;     -- notion_id → document uuid
  v_stats jsonb := '{}'::jsonb;
  r jsonb;
  v_id uuid;
  v_new boolean;
  v_start date;
  v_due date;
  v_sort int := 0;
begin
  if not public.is_admin() then
    raise exception 'noPermission' using errcode = '42501';
  end if;
  if v_mode not in ('skip', 'update') then
    raise exception 'invalidMode' using errcode = '22023';
  end if;


  -- ---------------------------------------------------------------------------
  -- 成員
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'members', '[]')) loop
    v_id := null;
    if nullif(r ->> 'existing_id', '') is not null then
      select id into v_id from public.members where id = (r ->> 'existing_id')::uuid;
      if v_id is not null then
        -- 記下 Notion id，日後重新匯入可以直接對應
        update public.members set notion_id = r ->> 'notion_id'
         where id = v_id and notion_id is null and nullif(r ->> 'notion_id', '') is not null
           and not exists (select 1 from public.members x where x.notion_id = r ->> 'notion_id');
        v_stats := public.notion_stat_bump(v_stats, 'members', 'linked');
      end if;
    else
      select id into v_id from public.members where notion_id = r ->> 'notion_id';
      if v_id is null and nullif(r ->> 'email', '') is not null then
        select id into v_id from public.members where lower(email) = lower(r ->> 'email');
        if v_id is not null then
          update public.members set notion_id = coalesce(notion_id, r ->> 'notion_id') where id = v_id;
          v_stats := public.notion_stat_bump(v_stats, 'members', 'linked');
        end if;
      elsif v_id is not null then
        if v_mode = 'update' then
          update public.members
             set name = coalesce(nullif(trim(r ->> 'name'), ''), name),
                 research_interests = case when jsonb_array_length(coalesce(r -> 'research_interests', '[]')) > 0
                                           then public.clean_tags(r -> 'research_interests') else research_interests end,
                 bio = coalesce(nullif(r ->> 'bio', ''), bio)
           where id = v_id;
          v_stats := public.notion_stat_bump(v_stats, 'members', 'updated');
        else
          v_stats := public.notion_stat_bump(v_stats, 'members', 'skipped');
        end if;
      end if;
      if v_id is null then
        insert into public.members (name, email, position, app_role, research_interests, bio, notion_id)
        values (left(coalesce(nullif(trim(r ->> 'name'), ''), '（未命名）'), 120),
                nullif(lower(trim(coalesce(r ->> 'email', ''))), ''),
                coalesce(nullif(r ->> 'position', ''), 'master')::public.member_position,
                'member', public.clean_tags(r -> 'research_interests'), nullif(r ->> 'bio', ''),
                nullif(r ->> 'notion_id', ''))
        returning id into v_id;
        v_stats := public.notion_stat_bump(v_stats, 'members', 'created');
      end if;
    end if;
    if v_id is not null then v_people := v_people || jsonb_build_object(r ->> 'key', v_id); end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 專案
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'projects', '[]')) loop
    v_start := nullif(r ->> 'start_date', '')::date;
    v_due := nullif(r ->> 'due_date', '')::date;
    if v_start is not null and v_due is not null and v_due < v_start then v_due := null; end if;
    select id into v_id from public.projects where notion_id = r ->> 'notion_id';
    v_new := v_id is null;
    if v_new then
      insert into public.projects (title, description, content, status, start_date, due_date, progress, tags, owner_id, notion_id)
      values (left(r ->> 'title', 300), nullif(r ->> 'description', ''), coalesce(r ->> 'content', ''),
              coalesce(nullif(r ->> 'status', ''), 'planning')::public.project_status, v_start, v_due,
              coalesce(nullif(r ->> 'progress', '')::int, 0), public.clean_tags(r -> 'tags'),
              (v_people ->> (r ->> 'owner_key'))::uuid, r ->> 'notion_id')
      returning id into v_id;
      v_stats := public.notion_stat_bump(v_stats, 'projects', 'created');
    elsif v_mode = 'update' then
      update public.projects
         set title = left(r ->> 'title', 300), description = nullif(r ->> 'description', ''),
             content = coalesce(r ->> 'content', ''), content_version = content_version + 1,
             status = coalesce(nullif(r ->> 'status', ''), status::text)::public.project_status,
             start_date = v_start, due_date = v_due,
             progress = coalesce(nullif(r ->> 'progress', '')::int, progress),
             tags = public.clean_tags(r -> 'tags'),
             owner_id = coalesce((v_people ->> (r ->> 'owner_key'))::uuid, owner_id)
       where id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'projects', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'projects', 'skipped');
    end if;
    v_projects := v_projects || jsonb_build_object(r ->> 'notion_id', v_id);
    if v_new or v_mode = 'update' then
      insert into public.project_members (project_id, member_id)
      select v_id, (v_people ->> x)::uuid from jsonb_array_elements_text(coalesce(r -> 'member_keys', '[]')) x
       where v_people ? x
      on conflict do nothing;
    end if;
  end loop;
  -- 已匯入過的專案（這次沒有選）也能被關聯
  select v_projects || coalesce(jsonb_object_agg(pr.notion_id, pr.id), '{}'::jsonb) into v_projects
    from public.projects pr where pr.notion_id is not null and not v_projects ? pr.notion_id;

  -- 成員頁的「參與專案」
  for r in select * from jsonb_array_elements(coalesce(p -> 'members', '[]')) loop
    if v_people ? (r ->> 'key') then
      insert into public.project_members (project_id, member_id)
      select (v_projects ->> x)::uuid, (v_people ->> (r ->> 'key'))::uuid
        from jsonb_array_elements_text(coalesce(r -> 'project_notion_ids', '[]')) x
       where v_projects ? x
      on conflict do nothing;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 任務
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'tasks', '[]')) loop
    select id into v_id from public.tasks where notion_id = r ->> 'notion_id';
    v_new := v_id is null;
    if v_new then
      insert into public.tasks (title, description, status, priority, due_date, project_id, notion_id)
      values (left(r ->> 'title', 300), nullif(r ->> 'description', ''),
              coalesce(nullif(r ->> 'status', ''), 'todo')::public.task_status,
              coalesce(nullif(r ->> 'priority', ''), 'medium')::public.task_priority,
              nullif(r ->> 'due_date', '')::date, (v_projects ->> (r ->> 'project_notion_id'))::uuid, r ->> 'notion_id')
      returning id into v_id;
      v_stats := public.notion_stat_bump(v_stats, 'tasks', 'created');
    elsif v_mode = 'update' then
      update public.tasks
         set title = left(r ->> 'title', 300), description = nullif(r ->> 'description', ''),
             status = coalesce(nullif(r ->> 'status', ''), status::text)::public.task_status,
             priority = coalesce(nullif(r ->> 'priority', ''), priority::text)::public.task_priority,
             due_date = nullif(r ->> 'due_date', '')::date,
             project_id = coalesce((v_projects ->> (r ->> 'project_notion_id'))::uuid, project_id)
       where id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'tasks', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'tasks', 'skipped');
    end if;
    if v_new or v_mode = 'update' then
      insert into public.task_assignees (task_id, member_id)
      select v_id, (v_people ->> x)::uuid from jsonb_array_elements_text(coalesce(r -> 'assignee_keys', '[]')) x
       where v_people ? x
      on conflict do nothing;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 論文
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'publications', '[]')) loop
    select id into v_id from public.publications where notion_id = r ->> 'notion_id';
    v_new := v_id is null;
    if v_new then
      insert into public.publications (title, stage, venue, doi, submitted_at, published_at, notes, project_id, notion_id)
      values (left(r ->> 'title', 500), coalesce(nullif(r ->> 'stage', ''), 'drafting')::public.publication_stage,
              nullif(r ->> 'venue', ''), nullif(r ->> 'doi', ''), nullif(r ->> 'submitted_at', '')::date,
              nullif(r ->> 'published_at', '')::date, nullif(r ->> 'notes', ''),
              (v_projects ->> (r ->> 'project_notion_id'))::uuid, r ->> 'notion_id')
      returning id into v_id;
      v_stats := public.notion_stat_bump(v_stats, 'publications', 'created');
    elsif v_mode = 'update' then
      update public.publications
         set title = left(r ->> 'title', 500), stage = coalesce(nullif(r ->> 'stage', ''), stage::text)::public.publication_stage,
             venue = nullif(r ->> 'venue', ''), doi = nullif(r ->> 'doi', ''),
             submitted_at = nullif(r ->> 'submitted_at', '')::date, published_at = nullif(r ->> 'published_at', '')::date,
             notes = nullif(r ->> 'notes', ''),
             project_id = coalesce((v_projects ->> (r ->> 'project_notion_id'))::uuid, project_id)
       where id = v_id;
      delete from public.publication_authors where publication_id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'publications', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'publications', 'skipped');
    end if;
    if v_new or v_mode = 'update' then
      insert into public.publication_authors (publication_id, member_id, display_name, author_order, is_first_author, is_corresponding)
      select v_id, (v_people ->> (a.v ->> 'key'))::uuid,
             case when v_people ? coalesce(a.v ->> 'key', '') then null else left(a.v ->> 'name', 200) end,
             a.ord, coalesce((a.v ->> 'is_first')::boolean, false), coalesce((a.v ->> 'is_corresponding')::boolean, false)
        from jsonb_array_elements(coalesce(r -> 'authors', '[]')) with ordinality a(v, ord)
       where nullif(trim(a.v ->> 'name'), '') is not null;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 軟體與工具
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'software', '[]')) loop
    select id into v_id from public.software_tools where notion_id = r ->> 'notion_id';
    if v_id is null then
      insert into public.software_tools (name, category, purpose, access_info, install_guide, url, docs_url, contact_id, notion_id)
      values (left(r ->> 'name', 200), coalesce(nullif(trim(r ->> 'category'), ''), '其他'), nullif(r ->> 'purpose', ''),
              nullif(r ->> 'access_info', ''), nullif(r ->> 'install_guide', ''),
              public.clean_url(r ->> 'url'), public.clean_url(r ->> 'docs_url'),
              (v_people ->> (r ->> 'contact_key'))::uuid, r ->> 'notion_id');
      v_stats := public.notion_stat_bump(v_stats, 'software', 'created');
    elsif v_mode = 'update' then
      update public.software_tools
         set name = left(r ->> 'name', 200), category = coalesce(nullif(trim(r ->> 'category'), ''), category),
             purpose = nullif(r ->> 'purpose', ''), access_info = nullif(r ->> 'access_info', ''),
             install_guide = nullif(r ->> 'install_guide', ''),
             url = public.clean_url(r ->> 'url'), docs_url = public.clean_url(r ->> 'docs_url'),
             contact_id = coalesce((v_people ->> (r ->> 'contact_key'))::uuid, contact_id)
       where id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'software', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'software', 'skipped');
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- Pipelines
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'pipelines', '[]')) loop
    select id into v_id from public.pipelines where notion_id = r ->> 'notion_id';
    if v_id is null then
      insert into public.pipelines (name, description, version, tags, maintainer_id, project_id, notion_id)
      values (left(r ->> 'name', 200), nullif(r ->> 'description', ''), coalesce(nullif(r ->> 'version', ''), '1.0.0'),
              public.clean_tags(r -> 'tags'), (v_people ->> (r ->> 'maintainer_key'))::uuid,
              (v_projects ->> (r ->> 'project_notion_id'))::uuid, r ->> 'notion_id');
      v_stats := public.notion_stat_bump(v_stats, 'pipelines', 'created');
    elsif v_mode = 'update' then
      update public.pipelines
         set name = left(r ->> 'name', 200), description = nullif(r ->> 'description', ''),
             version = coalesce(nullif(r ->> 'version', ''), version), tags = public.clean_tags(r -> 'tags'),
             maintainer_id = coalesce((v_people ->> (r ->> 'maintainer_key'))::uuid, maintainer_id),
             project_id = coalesce((v_projects ->> (r ->> 'project_notion_id'))::uuid, project_id)
       where id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'pipelines', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'pipelines', 'skipped');
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 會議
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'meetings', '[]')) loop
    select id into v_id from public.meetings where notion_id = r ->> 'notion_id';
    v_new := v_id is null;
    if v_new then
      insert into public.meetings (title, type, starts_at, summary, links, notion_id)
      values (left(r ->> 'title', 300), coalesce(nullif(r ->> 'type', ''), 'lab_meeting')::public.meeting_type,
              (r ->> 'starts_at')::timestamptz, nullif(r ->> 'summary', ''), public.clean_links(r -> 'links'), r ->> 'notion_id')
      returning id into v_id;
      v_stats := public.notion_stat_bump(v_stats, 'meetings', 'created');
    elsif v_mode = 'update' then
      update public.meetings
         set title = left(r ->> 'title', 300), type = coalesce(nullif(r ->> 'type', ''), type::text)::public.meeting_type,
             starts_at = (r ->> 'starts_at')::timestamptz, summary = nullif(r ->> 'summary', ''),
             summary_version = summary_version + 1, links = public.clean_links(r -> 'links')
       where id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'meetings', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'meetings', 'skipped');
    end if;
    if v_new or v_mode = 'update' then
      insert into public.meeting_attendees (meeting_id, member_id)
      select v_id, (v_people ->> x)::uuid from jsonb_array_elements_text(coalesce(r -> 'attendee_keys', '[]')) x
       where v_people ? x
      on conflict do nothing;
      insert into public.meeting_projects (meeting_id, project_id)
      select v_id, (v_projects ->> x)::uuid from jsonb_array_elements_text(coalesce(r -> 'project_notion_ids', '[]')) x
       where v_projects ? x
      on conflict do nothing;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- 文件（新生入門）：先建立／更新，再設定上層頁面
  -- ---------------------------------------------------------------------------
  select coalesce(max(sort_order), 0) into v_sort from public.documents where parent_id is null;
  for r in select * from jsonb_array_elements(coalesce(p -> 'documents', '[]')) loop
    v_sort := v_sort + 1;
    select id into v_id from public.documents where notion_id = r ->> 'notion_id';
    if v_id is null then
      insert into public.documents (kind, slug, title, emoji, content, sort_order, notion_id)
      values ('orientation', public.document_slug(r ->> 'title'), left(r ->> 'title', 300),
              case when r ->> 'notion_id' = 'notion-import-root' then '📥' else '📄' end,
              coalesce(r ->> 'content', ''), v_sort, r ->> 'notion_id')
      returning id into v_id;
      v_stats := public.notion_stat_bump(v_stats, 'documents', 'created');
    elsif v_mode = 'update' then
      update public.documents
         set title = left(r ->> 'title', 300), content = coalesce(r ->> 'content', ''), content_version = content_version + 1
       where id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'documents', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'documents', 'skipped');
    end if;
    v_docs := v_docs || jsonb_build_object(r ->> 'notion_id', v_id);
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p -> 'documents', '[]')) loop
    if nullif(r ->> 'parent_notion_id', '') is not null then
      -- 只設定還沒有上層的頁面（匯入後手動移動過的不覆蓋）
      update public.documents d
         set parent_id = coalesce((v_docs ->> (r ->> 'parent_notion_id'))::uuid,
                                  (select x.id from public.documents x where x.notion_id = r ->> 'parent_notion_id'))
       where d.id = (v_docs ->> (r ->> 'notion_id'))::uuid and d.parent_id is null
         and d.id is distinct from (v_docs ->> (r ->> 'parent_notion_id'))::uuid;
    end if;
  end loop;

  -- ---------------------------------------------------------------------------
  -- FAQ
  -- ---------------------------------------------------------------------------
  for r in select * from jsonb_array_elements(coalesce(p -> 'faqs', '[]')) loop
    select id into v_id from public.faqs where notion_id = r ->> 'notion_id';
    if v_id is null then
      insert into public.faqs (question, answer, category, notion_id)
      values (left(r ->> 'question', 500), coalesce(r ->> 'answer', ''), coalesce(nullif(r ->> 'category', ''), 'Notion'), r ->> 'notion_id');
      v_stats := public.notion_stat_bump(v_stats, 'faqs', 'created');
    elsif v_mode = 'update' then
      update public.faqs set question = left(r ->> 'question', 500), answer = coalesce(r ->> 'answer', '') where id = v_id;
      v_stats := public.notion_stat_bump(v_stats, 'faqs', 'updated');
    else
      v_stats := public.notion_stat_bump(v_stats, 'faqs', 'skipped');
    end if;
  end loop;

  return v_stats;
end;
$$;

-- /notion/<id>：找出匯入後對應的頁面
create or replace function public.resolve_notion(p_id text)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('type', 'project', 'id', id) from public.projects where notion_id = p_id),
    (select jsonb_build_object('type', 'document', 'id', id, 'slug', slug) from public.documents where notion_id = p_id),
    (select jsonb_build_object('type', 'meeting', 'id', id) from public.meetings where notion_id = p_id),
    (select jsonb_build_object('type', 'pipeline', 'id', id) from public.pipelines where notion_id = p_id),
    (select jsonb_build_object('type', 'software_tool', 'id', id) from public.software_tools where notion_id = p_id),
    (select jsonb_build_object('type', 'member', 'id', id) from public.members where notion_id = p_id),
    (select jsonb_build_object('type', 'task', 'id', id, 'title', title) from public.tasks where notion_id = p_id),
    (select jsonb_build_object('type', 'publication', 'id', id, 'title', title) from public.publications where notion_id = p_id),
    (select jsonb_build_object('type', 'faq', 'id', id, 'title', question) from public.faqs where notion_id = p_id)
  );
$$;

revoke execute on function public.import_notion(jsonb), public.resolve_notion(text), public.notion_stat_bump(jsonb, text, text) from public, anon;
grant execute on function public.import_notion(jsonb), public.resolve_notion(text), public.notion_stat_bump(jsonb, text, text) to authenticated;
