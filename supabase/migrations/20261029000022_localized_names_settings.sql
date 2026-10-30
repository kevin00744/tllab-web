-- =============================================================================
-- TL Lab Hub — 22 成員名稱依介面語言顯示、個人顯示偏好
--   網頁伺服器在每個資料庫請求帶上 x-lab-locale（zh-TW／en）
--   中文介面：中文名稱（name），沒有時用英文名稱；英文介面：英文名稱（name_en），沒有時用中文名稱
--   顯示用的 JSON 另外帶 alt_name（另一個語言的名稱），選擇成員時中英文都能搜尋
--   member_preferences.settings：隱藏已完成的任務／專案（每個人自己的設定）
-- =============================================================================

create or replace function public.request_locale()
returns text
language sql stable
set search_path = ''
as $$
  select case when coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json ->> 'x-lab-locale' = 'en'
              then 'en' else 'zh-TW' end;
$$;

create or replace function public.display_name(p_name text, p_name_en text)
returns text
language sql stable
set search_path = ''
as $$
  select case when public.request_locale() = 'en'
              then coalesce(nullif(trim(p_name_en), ''), p_name)
              else coalesce(nullif(trim(p_name), ''), p_name_en) end;
$$;

-- 另一個語言的名稱（與顯示名稱相同時為 null）
create or replace function public.alt_name(p_name text, p_name_en text)
returns text
language sql stable
set search_path = ''
as $$
  select nullif(case when public.request_locale() = 'en' then p_name else nullif(trim(p_name_en), '') end,
                public.display_name(p_name, p_name_en));
$$;

grant execute on function public.request_locale(), public.display_name(text, text), public.alt_name(text, text) to anon, authenticated;

-- public.member_brief
create or replace function public.member_brief(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object('id', m.id, 'name', public.display_name(m.name, m.name_en), 'alt_name', public.alt_name(m.name, m.name_en), 'avatar_url', m.avatar_url)
    from public.members m where m.id = p_id;
$$;

-- public.form_options
create or replace function public.form_options()
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', public.display_name(m.name, m.name_en), 'alt_name', public.alt_name(m.name, m.name_en), 'avatar_url', m.avatar_url,
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

-- public.project_json
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
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', public.display_name(m.name, m.name_en), 'alt_name', public.alt_name(m.name, m.name_en), 'avatar_url', m.avatar_url, 'role', pm.role)
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

-- public.task_json
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
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', public.display_name(m.name, m.name_en), 'alt_name', public.alt_name(m.name, m.name_en), 'avatar_url', m.avatar_url)
                       order by m.sort_order, m.name)
        from public.task_assignees ta join public.members m on m.id = ta.member_id
       where ta.task_id = t.id), '[]'::jsonb),
    'created_by', public.member_brief(t.created_by),
    'editable', public.can_edit_task(t.id),
    'deletable', public.can_delete_task(t.id)
  );
$$;

-- public.meeting_json
create or replace function public.meeting_json(mt public.meetings)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', mt.id, 'title', mt.title, 'emoji', mt.emoji, 'type', mt.type,
    'starts_at', mt.starts_at, 'ends_at', mt.ends_at, 'location', mt.location,
    'attendees', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'name', public.display_name(m.name, m.name_en), 'alt_name', public.alt_name(m.name, m.name_en), 'avatar_url', m.avatar_url, 'is_presenter', ma.is_presenter)
                       order by ma.is_presenter desc, m.sort_order, m.name)
        from public.meeting_attendees ma join public.members m on m.id = ma.member_id
       where ma.meeting_id = mt.id), '[]'::jsonb),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji) order by p.title)
        from public.meeting_projects mp join public.projects p on p.id = mp.project_id
       where mp.meeting_id = mt.id), '[]'::jsonb),
    'action_total', (select count(*) from public.action_items a where a.meeting_id = mt.id),
    'action_open', (select count(*) from public.action_items a where a.meeting_id = mt.id and not a.is_done),
    'links', mt.links,
    'has_notes', coalesce(mt.summary, '') <> '' or coalesce(mt.decisions, '') <> '',
    'editable', public.can_edit_meeting(mt.id), 'deletable', public.can_delete_own(mt.created_by)
  );
$$;

-- public.list_calendar
create or replace function public.list_calendar(p_from date, p_to date, p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  with me as (select public.current_member_id() as id),
  kinds as (
    select coalesce((select array_agg(x) from jsonb_array_elements_text(p_filter -> 'kinds') x),
                    array['event', 'meeting', 'task', 'publication']) as k
  ),
  items as (
    select 'event' as kind, ev.id, ev.title, '📅' as emoji, ev.starts_at, ev.ends_at, ev.all_day,
           (ev.starts_at at time zone 'Asia/Taipei')::date as start_date,
           (coalesce(ev.ends_at, ev.starts_at) at time zone 'Asia/Taipei')::date as end_date,
           ev.location, ev.category, null::text as status, ev.description, ev.project_id,
           (ev.created_by = me.id or exists (select 1 from public.calendar_event_members cm
                                              where cm.event_id = ev.id and cm.member_id = me.id)) as mine,
           coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', public.display_name(m.name, m.name_en), 'alt_name', public.alt_name(m.name, m.name_en), 'avatar_url', m.avatar_url) order by m.name)
                       from public.calendar_event_members cm join public.members m on m.id = cm.member_id
                      where cm.event_id = ev.id), '[]'::jsonb) as members,
           public.is_editor() as editable,
           public.can_delete_own(ev.created_by) as deletable,
           public.member_brief(ev.created_by) as created_by
      from public.calendar_events ev, me
    union all
    select 'meeting', mt.id, mt.title, mt.emoji, mt.starts_at, mt.ends_at, false,
           (mt.starts_at at time zone 'Asia/Taipei')::date, (coalesce(mt.ends_at, mt.starts_at) at time zone 'Asia/Taipei')::date,
           mt.location, mt.type::text, null, null, null,
           exists (select 1 from public.meeting_attendees ma where ma.meeting_id = mt.id and ma.member_id = me.id),
           '[]'::jsonb, false, false, null
      from public.meetings mt, me
    union all
    select 'task', t.id, t.title, '✅', null, null, true, t.due_date, t.due_date, null, t.priority::text, t.status::text,
           null, t.project_id,
           exists (select 1 from public.task_assignees ta where ta.task_id = t.id and ta.member_id = me.id),
           '[]'::jsonb, false, false, null
      from public.tasks t, me
     where t.due_date is not null and t.status <> 'done'
    union all
    select 'publication', pb.id, pb.title, pb.emoji, null, null, true, pb.deadline, pb.deadline, pb.venue, pb.type::text, pb.stage::text,
           null, pb.project_id,
           exists (select 1 from public.publication_authors pa where pa.publication_id = pb.id and pa.member_id = me.id),
           '[]'::jsonb, false, false, null
      from public.publications pb, me
     where pb.deadline is not null and pb.stage not in ('accepted', 'published')
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'kind', i.kind, 'id', i.id, 'title', i.title, 'emoji', i.emoji,
           'starts_at', i.starts_at, 'ends_at', i.ends_at, 'all_day', i.all_day,
           'start_date', i.start_date, 'end_date', greatest(i.end_date, i.start_date),
           'location', i.location, 'category', i.category, 'status', i.status, 'description', i.description,
           'project', (select jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji) from public.projects p where p.id = i.project_id),
           'mine', i.mine, 'members', i.members, 'editable', i.editable, 'deletable', i.deletable, 'created_by', i.created_by
         ) order by i.start_date, i.all_day desc, i.starts_at nulls first, i.title), '[]'::jsonb)
    from items i, kinds
   where i.kind = any (kinds.k)
     and i.start_date <= p_to and greatest(i.end_date, i.start_date) >= p_from
     and (coalesce((p_filter ->> 'mine')::boolean, false) = false or i.mine);
$$;

-- public.publication_json
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
               'name', coalesce(pa.display_name, public.display_name(m.name, m.name_en)),
               'display_name', pa.display_name,
               'is_first_author', pa.is_first_author,
               'is_corresponding', pa.is_corresponding) order by pa.author_order)
        from public.publication_authors pa left join public.members m on m.id = pa.member_id
       where pa.publication_id = pb.id), '[]'::jsonb),
    'editable', public.can_edit_publication(pb.id),
    'deletable', public.can_delete_publication(pb.id)
  );
$$;

-- public.get_dashboard
create or replace function public.get_dashboard(p_days integer default 14)
returns jsonb
language sql stable
set search_path = ''
as $$
  with me as (
    select public.current_member_id() as id, public.lab_today() as today
  ),
  my_open as (
    select t.id, t.title, t.status, t.priority, t.due_date,
           t.due_date < me.today as overdue,
           case when p.id is null then null
                else jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji) end as project,
           row_number() over (
             order by t.due_date nulls last,
                      array_position(array['high', 'medium', 'low']::public.task_priority[], t.priority),
                      t.created_at) as rn
      from public.tasks t
      join public.task_assignees ta on ta.task_id = t.id
      cross join me
      left join public.projects p on p.id = t.project_id
     where ta.member_id = me.id and t.status <> 'done'
  ),
  my_tasks as (
    select * from my_open where rn <= 8
  ),
  projects as (
    select v.id, v.title, v.emoji, v.status, v.progress, v.task_progress,
           v.task_total, v.task_done, v.task_overdue, v.due_date,
           public.display_name(o.name, o.name_en) as owner_name,
           (v.owner_id = (select id from me)
             or exists (select 1 from public.project_members pm where pm.project_id = v.id and pm.member_id = (select id from me))) as mine,
           row_number() over (
             order by array_position(array['active', 'planning', 'paused']::public.project_status[], v.status),
                      v.due_date nulls last, v.title) as rn
      from public.v_project_overview v
      left join public.members o on o.id = v.owner_id
     where v.status <> 'completed'
  ),
  stages as (
    select s.stage, s.total,
           coalesce((
             select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'venue', x.venue) order by x.updated_at desc)
               from (select pb.id, pb.title, pb.venue, pb.updated_at
                       from public.publications pb
                      where pb.stage = s.stage
                      order by pb.updated_at desc
                      limit 3) x
           ), '[]'::jsonb) as items
      from public.v_publication_stage_counts s
  ),
  recent_meetings as (
    select mt.id, mt.title, mt.emoji, mt.type, mt.starts_at, mt.location,
           left(mt.summary, 400) as summary,
           (select count(*) from public.meeting_attendees ma where ma.meeting_id = mt.id) as attendee_count,
           coalesce((select jsonb_agg(public.display_name(m.name, m.name_en) order by m.name)
                       from public.meeting_attendees ma
                       join public.members m on m.id = ma.member_id
                      where ma.meeting_id = mt.id and ma.is_presenter), '[]'::jsonb) as presenters,
           row_number() over (order by mt.starts_at desc) as rn
      from public.meetings mt
     where mt.starts_at <= now()
  ),
  next_meeting as (
    select mt.id, mt.title, mt.emoji, mt.type, mt.starts_at, mt.ends_at, mt.location
      from public.meetings mt
     where mt.starts_at > now()
     order by mt.starts_at
     limit 1
  ),
  deadlines as (
    select d.kind, d.id, d.title, d.emoji, d.due_date, d.status, d.priority,
           me.id = any(d.member_ids) as mine,
           p.title as project_title,
           row_number() over (order by d.due_date, d.kind desc, d.title) as rn
      from public.v_upcoming_deadlines d
      cross join me
      left join public.projects p on p.id = d.project_id
     where d.due_date between me.today and me.today + greatest(1, least(p_days, 60)) - 1
  )
  select jsonb_build_object(
    'today', (select today from me),
    'kpis', public.dashboard_kpis(),
    'my_open', (select count(*) from my_open),
    'my_overdue', (select count(*) from my_open where overdue),
    'my_tasks', coalesce((select jsonb_agg(to_jsonb(t) - 'rn' order by t.rn) from my_tasks t), '[]'::jsonb),
    -- 參與的專案另外標示 mine；前端依個人設定只顯示自己的或全部
    'projects', coalesce((select jsonb_agg(to_jsonb(p) - 'rn' order by p.rn) from projects p where p.rn <= 40), '[]'::jsonb),
    'publication_stages', coalesce((select jsonb_agg(to_jsonb(s) order by s.stage) from stages s), '[]'::jsonb),
    'recent_meetings', coalesce((select jsonb_agg(to_jsonb(m) - 'rn' order by m.rn) from recent_meetings m where m.rn <= 3), '[]'::jsonb),
    'next_meeting', (select to_jsonb(n) from next_meeting n),
    'deadlines', coalesce((select jsonb_agg(to_jsonb(d) - 'rn' order by d.rn) from deadlines d where d.rn <= 30), '[]'::jsonb),
    -- 未來 7 天的行事曆活動與會議
    'upcoming', public.list_calendar((select today from me), (select today from me) + 6, '{"kinds":["event","meeting"]}'),
    'prefs', coalesce((select mp.dashboard from public.member_preferences mp where mp.member_id = (select id from me)), '{}'::jsonb)
  );
$$;

-- public.member_json
create or replace function public.member_json(m public.members)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'name_en', m.name_en, 'display_name', public.display_name(m.name, m.name_en), 'email', m.email, 'avatar_url', m.avatar_url,
    'position', m.position, 'app_role', m.app_role, 'is_alumni', m.is_alumni, 'is_system_admin', m.is_system_admin,
    'research_interests', to_jsonb(m.research_interests), 'bio', m.bio,
    'join_year', m.join_year, 'left_year', m.left_year, 'current_affiliation', m.current_affiliation,
    'links', m.links, 'sort_order', m.sort_order,
    'has_account', m.user_id is not null,
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji, 'status', p.status,
                                          'is_owner', p.owner_id = m.id)
                       order by p.owner_id = m.id desc, p.status = 'completed', p.title)
        from public.projects p
       where p.owner_id = m.id
          or exists (select 1 from public.project_members pm where pm.project_id = p.id and pm.member_id = m.id)),
      '[]'::jsonb),
    'editable', public.is_admin() or m.id = public.current_member_id(),
    'manageable', case when m.app_role = 'admin' then public.is_system_admin() else public.is_admin() end,
    'is_me', m.id = public.current_member_id()
  );
$$;

-- public.search_all
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
    select 'member'::text, m.id, public.display_name(m.name, m.name_en), coalesce(public.alt_name(m.name, m.name_en), '') || ' · ' || array_to_string(m.research_interests, ', '),
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

-- -----------------------------------------------------------------------------
-- 個人顯示偏好
-- -----------------------------------------------------------------------------
alter table public.member_preferences add column if not exists settings jsonb not null default '{}'::jsonb;

create or replace function public.get_my_settings()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce((select settings from public.member_preferences where member_id = public.current_member_id()), '{}'::jsonb);
$$;

-- 只保留已知的設定值；只更新有傳入的鍵
create or replace function public.save_my_settings(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_keys text[] := array['hide_done_tasks', 'hide_done_projects'];
  v jsonb;
begin
  if public.current_member_id() is null then raise exception 'noPermission' using errcode = '42501'; end if;
  v := public.get_my_settings() || coalesce((
         select jsonb_object_agg(k, (p ->> k)::boolean)
           from jsonb_object_keys(p) k
          where k = any (v_keys) and jsonb_typeof(p -> k) = 'boolean'), '{}'::jsonb);
  insert into public.member_preferences (member_id, settings)
  values (public.current_member_id(), v)
  on conflict (member_id) do update set settings = excluded.settings, updated_at = now();
  return v;
end;
$$;

revoke execute on function public.get_my_settings(), public.save_my_settings(jsonb) from public, anon;
grant execute on function public.get_my_settings(), public.save_my_settings(jsonb) to authenticated;
