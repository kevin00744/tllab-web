-- =============================================================================
-- TL Lab Hub — 18 公開瀏覽（未登入唯讀）、活動紀錄批量刪除（階段 10）
-- -----------------------------------------------------------------------------
-- 未登入（anon）可以瀏覽：成員、專案、任務、已發表論文、新生入門、FAQ、軟體、Pipelines、
--   頁面設定，以及上述資料的活動紀錄
-- 未登入看不到：會議紀錄（含 Action items）、未發表論文、行事曆、個人設定、邀請碼、
--   專案附件（進度報告），以及成員的 Email、登入帳號與權限
-- 寫入一律需要登入（anon 沒有任何 insert／update／delete policy）
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 讀取 policy
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['members', 'projects', 'project_members', 'tasks', 'task_assignees', 'documents', 'faqs',
                           'software_tools', 'pipelines', 'pipeline_steps', 'page_settings']
  loop
    execute format('drop policy if exists %I on public.%I', t || '_public', t);
    execute format('create policy %I on public.%I for select to anon using (true)', t || '_public', t);
  end loop;
end;
$$;

drop policy if exists publications_public on public.publications;
create policy publications_public on public.publications for select to anon
  using (stage = 'published');
drop policy if exists publication_authors_public on public.publication_authors;
create policy publication_authors_public on public.publication_authors for select to anon
  using (exists (select 1 from public.publications pb where pb.id = publication_id and pb.stage = 'published'));

-- 活動紀錄：只列出公開資料的紀錄（成員的變更可能含 Email，不公開）
drop policy if exists activity_log_public on public.activity_log;
create policy activity_log_public on public.activity_log for select to anon
  using (entity_type in ('project', 'task', 'document', 'faq', 'software_tool', 'pipeline')
         or (entity_type = 'publication'
             and exists (select 1 from public.publications pb where pb.id = entity_id and pb.stage = 'published')));

-- 未登入不能寫入任何資料表（RLS 也沒有 anon 的寫入 policy，這裡再加一道）
revoke insert, update, delete, truncate on all tables in schema public from anon;

-- 成員：不公開 Email、登入帳號與權限（欄位層級權限，直接呼叫 REST API 也讀不到）
revoke select on public.members from anon;
grant select (id, name, name_en, avatar_url, position, is_alumni, research_interests, bio, join_year, left_year,
              current_affiliation, links, sort_order, created_at, updated_at)
  on public.members to anon;

-- 成員 JSON：以 id 取得（security definer），未登入時遮蔽 Email、帳號與權限
-- （以 id 呼叫，呼叫端只需讀得到 id 欄位）
create or replace function public.member_card(p_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.current_member_id() is null
              then public.member_json(m) || jsonb_build_object('email', null, 'has_account', false, 'app_role', 'member',
                                                               'is_system_admin', false)
              else public.member_json(m) end
    from public.members m where m.id = p_id;
$$;

create or replace function public.list_members(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.member_card(m.id)
                            order by m.is_alumni,
                                     array_position(array['pi', 'postdoc', 'phd', 'master', 'undergrad', 'staff']::public.member_position[], m.position),
                                     m.sort_order, m.join_year nulls last, m.name), '[]'::jsonb)
    from public.members m
   where (p_filter ->> 'position' is null or m.position::text = p_filter ->> 'position')
     and (p_filter ->> 'alumni' is null or m.is_alumni = (p_filter ->> 'alumni')::boolean)
     and (coalesce(p_filter ->> 'q', '') = ''
          or m.name ilike public.like_pattern(p_filter ->> 'q')
          or m.name_en ilike public.like_pattern(p_filter ->> 'q')
          or array_to_string(m.research_interests, ' ') ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.get_member(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.member_card(m.id) || jsonb_build_object(
    'publications', public.list_publications(jsonb_build_object('member_id', m.id)),
    'tasks', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                from jsonb_array_elements(public.list_tasks(jsonb_build_object('member_id', m.id))) x
               where x ->> 'status' <> 'done')
  )
    from public.members m where m.id = p_id;
$$;

-- 全站搜尋：不再以 Email 比對（未登入時讀不到該欄位）
create or replace function public.search_all(q text, max_results integer default 30)
returns table (
  entity_type text,
  id          uuid,
  title       text,
  subtitle    text,
  emoji       text,
  score       real,
  link_key    text
)
language sql stable
set search_path = public, extensions
as $$
  with params as (
    select '%' || replace(replace(replace(trim(q), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat,
           trim(q) as term
  ),
  hits as (
    select 'member'::text, m.id, m.name, coalesce(m.name_en, '') || ' · ' || array_to_string(m.research_interests, ', '),
           '👤'::text, similarity(m.name || ' ' || coalesce(m.name_en, ''), p.term), null::text
      from members m, params p
     where m.name ilike p.pat or m.name_en ilike p.pat
        or array_to_string(m.research_interests, ' ') ilike p.pat
    union all
    select 'project', pr.id, pr.title, left(pr.description, 120), pr.emoji, similarity(pr.title, p.term), null
      from projects pr, params p
     where pr.title ilike p.pat or pr.description ilike p.pat or array_to_string(pr.tags, ' ') ilike p.pat
    union all
    select 'task', t.id, t.title, left(t.description, 120), '✅', similarity(t.title, p.term), null
      from tasks t, params p
     where t.title ilike p.pat or t.description ilike p.pat
    union all
    select 'publication', pb.id, pb.title, pb.venue, pb.emoji, similarity(pb.title, p.term), null
      from publications pb, params p
     where pb.title ilike p.pat or pb.venue ilike p.pat or pb.doi ilike p.pat or pb.notes ilike p.pat
    union all
    select 'meeting', mt.id, mt.title, to_char(mt.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD'), mt.emoji,
           similarity(mt.title, p.term), null
      from meetings mt, params p
     where mt.title ilike p.pat or mt.summary ilike p.pat or mt.decisions ilike p.pat
        or mt.location ilike p.pat
        or exists (select 1 from action_items a where a.meeting_id = mt.id and a.content ilike p.pat)
    union all
    select 'document', d.id, d.title, left(d.content, 120), d.emoji, similarity(d.title, p.term), d.slug
      from documents d, params p
     where d.title ilike p.pat or d.content ilike p.pat
    union all
    select 'faq', f.id, f.question, f.category, '❓', similarity(f.question, p.term), null
      from faqs f, params p
     where f.question ilike p.pat or f.answer ilike p.pat or array_to_string(f.tags, ' ') ilike p.pat
    union all
    select 'software_tool', s.id, s.name, s.purpose, s.emoji, similarity(s.name, p.term), null
      from software_tools s, params p
     where s.name ilike p.pat or s.purpose ilike p.pat or s.category ilike p.pat
    union all
    select 'pipeline', pl.id, pl.name, left(pl.description, 120), pl.emoji, similarity(pl.name, p.term), null
      from pipelines pl, params p
     where pl.name ilike p.pat or pl.description ilike p.pat or array_to_string(pl.tags, ' ') ilike p.pat
    union all
    select 'calendar_event', ev.id, ev.title, to_char(ev.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD'), '📅',
           similarity(ev.title, p.term), to_char(ev.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD')
      from calendar_events ev, params p
     where ev.title ilike p.pat or ev.description ilike p.pat or ev.location ilike p.pat
  )
  select * from hits h(entity_type, id, title, subtitle, emoji, score, link_key)
   where length(trim(q)) > 0
   order by h.score desc, h.title
   limit greatest(1, least(max_results, 100));
$$;

-- 檢視表皆為 security_invoker，未登入時同樣套用上面的 RLS
grant select on public.v_project_overview, public.v_upcoming_deadlines, public.v_publication_stage_counts to anon;

-- -----------------------------------------------------------------------------
-- 未登入可執行的讀取函式（明確列出；伺服器端專用與寫入函式維持不開放）
-- -----------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'member_card(uuid)', 'member_json(public.members)', 'member_brief(uuid)', 'list_members(jsonb)', 'get_member(uuid)',
    'like_pattern(text)', 'is_system_admin()', 'can_delete_own(uuid)', 'can_delete_project(uuid)',
    'can_delete_task(uuid)', 'can_delete_publication(uuid)',
    'project_json(public.projects)', 'list_projects(jsonb)', 'get_project(uuid)', 'list_attachments(text, uuid)',
    'task_json(public.tasks)', 'list_tasks(jsonb)', 'publication_json(public.publications)', 'list_publications(jsonb)',
    'publication_year_stats()', 'form_options()', 'dashboard_kpis()', 'get_dashboard(integer)', 'list_calendar(date, date, jsonb)',
    'document_json(public.documents)', 'list_documents(public.document_kind)', 'get_document(text)',
    'faq_json(public.faqs)', 'list_faqs(jsonb)', 'faq_categories()',
    'software_json(public.software_tools)', 'list_software(jsonb)', 'get_software(uuid)',
    'pipeline_json(public.pipelines)', 'list_pipelines(jsonb)', 'get_pipeline(uuid)',
    'search_all(text, integer)', 'list_activity(jsonb)', 'list_page_settings()', 'resolve_notion(text)']
  loop
    execute format('grant execute on function public.%s to anon', f);
  end loop;
  execute 'grant execute on function public.member_card(uuid) to authenticated';
end;
$$;

-- -----------------------------------------------------------------------------
-- 活動紀錄批量刪除（僅系統管理員）
-- 依 id 刪除，或刪除符合篩選條件（類型、成員、某日期以前）的所有紀錄；回傳刪除筆數
-- -----------------------------------------------------------------------------
create or replace function public.delete_activity(p jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_system_admin() then
    raise exception 'noPermission' using errcode = '42501';
  end if;
  if jsonb_typeof(p -> 'ids') = 'array' then
    delete from public.activity_log
     where id in (select x::bigint from jsonb_array_elements_text(p -> 'ids') x);
  elsif nullif(p ->> 'before', '') is not null then
    -- 台灣時間該日 00:00 以前
    delete from public.activity_log
     where created_at < ((p ->> 'before')::date)::timestamp at time zone 'Asia/Taipei'
       and (p ->> 'entity_type' is null or entity_type = p ->> 'entity_type')
       and (p ->> 'actor_id' is null or actor_id = (p ->> 'actor_id')::uuid);
  else
    raise exception 'invalidFilter' using errcode = '22023';
  end if;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.delete_activity(jsonb) from public, anon;
grant execute on function public.delete_activity(jsonb) to authenticated;
