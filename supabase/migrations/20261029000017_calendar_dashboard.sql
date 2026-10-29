-- =============================================================================
-- TL Lab Hub — 17 共同編輯行事曆、個人化 Dashboard（階段 9）
-- -----------------------------------------------------------------------------
-- * calendar_events：所有成員（member 以上）都能新增與修改（共同編輯），刪除限建立者或 Admin
-- * list_calendar：活動＋會議＋任務截止日＋論文截止日，依台灣日期篩選
-- * member_preferences：每個人自己的 Dashboard 設定（區塊順序、隱藏、只看自己的）
-- =============================================================================

create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 300),
  description text,                                        -- Markdown
  location    text,
  category    text not null default 'event'
              check (category in ('event', 'deadline', 'leave', 'booking', 'holiday', 'other')),
  all_day     boolean not null default false,              -- 全天：starts_at／ends_at 為台灣時間 00:00，ends_at 為最後一天
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  project_id  uuid references public.projects (id) on delete set null,
  notion_id   text unique,
  created_by  uuid default public.current_member_id() references public.members (id) on delete set null,
  updated_by  uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint calendar_events_time check (ends_at is null or ends_at >= starts_at)
);
create index calendar_events_starts_idx on public.calendar_events (starts_at);
create index calendar_events_title_trgm on public.calendar_events using gin (title gin_trgm_ops);

create trigger calendar_events_touch before update on public.calendar_events
  for each row execute function public.touch_updated_at();
create trigger calendar_events_activity after insert or update or delete on public.calendar_events
  for each row execute function public.log_activity('calendar_event');

-- 相關成員（例如請假的人、參加的人）
create table public.calendar_event_members (
  event_id  uuid not null references public.calendar_events (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (event_id, member_id)
);
create index calendar_event_members_member_idx on public.calendar_event_members (member_id);

alter table public.calendar_events enable row level security;
alter table public.calendar_event_members enable row level security;

create policy calendar_events_select on public.calendar_events for select to authenticated
  using (public.current_member_id() is not null);
create policy calendar_events_insert on public.calendar_events for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy calendar_events_update on public.calendar_events for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy calendar_events_delete on public.calendar_events for delete to authenticated
  using (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));

create policy calendar_event_members_select on public.calendar_event_members for select to authenticated
  using (public.current_member_id() is not null);
create policy calendar_event_members_write on public.calendar_event_members for all to authenticated
  using (public.is_editor()) with check (public.is_editor());

grant select, insert, update, delete on public.calendar_events, public.calendar_event_members to authenticated;

-- -----------------------------------------------------------------------------
-- 行事曆資料：活動、會議、任務截止日、論文截止日
-- 篩選：kinds（event / meeting / task / publication）、mine（只看自己相關）
-- 日期一律以台灣時間計算
-- -----------------------------------------------------------------------------
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
           coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name, 'avatar_url', m.avatar_url) order by m.name)
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

create or replace function public.save_calendar_event(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_title text := trim(coalesce(p ->> 'title', ''));
  v_start timestamptz := nullif(p ->> 'starts_at', '')::timestamptz;
  v_end timestamptz := nullif(p ->> 'ends_at', '')::timestamptz;
  v_cat text := coalesce(nullif(p ->> 'category', ''), 'event');
begin
  if v_title = '' then raise exception 'titleRequired' using errcode = '22023'; end if;
  if v_start is null then raise exception 'dateRequired' using errcode = '22023'; end if;
  if v_end is not null and v_end < v_start then raise exception 'dateOrder' using errcode = '22023'; end if;
  if v_cat not in ('event', 'deadline', 'leave', 'booking', 'holiday', 'other') then v_cat := 'other'; end if;

  if v_id is null then
    insert into public.calendar_events (title, description, location, category, all_day, starts_at, ends_at, project_id)
    values (left(v_title, 300), nullif(p ->> 'description', ''), nullif(trim(coalesce(p ->> 'location', '')), ''), v_cat,
            coalesce((p ->> 'all_day')::boolean, false), v_start, v_end, nullif(p ->> 'project_id', '')::uuid)
    returning id into v_id;
  else
    update public.calendar_events
       set title = left(v_title, 300), description = nullif(p ->> 'description', ''),
           location = nullif(trim(coalesce(p ->> 'location', '')), ''), category = v_cat,
           all_day = coalesce((p ->> 'all_day')::boolean, all_day), starts_at = v_start, ends_at = v_end,
           project_id = nullif(p ->> 'project_id', '')::uuid, updated_by = public.current_member_id()
     where id = v_id;
    if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  end if;

  if p ? 'member_ids' then
    insert into public.calendar_event_members (event_id, member_id)
    select v_id, x::uuid from jsonb_array_elements_text(p -> 'member_ids') x
    on conflict do nothing;
    delete from public.calendar_event_members
     where event_id = v_id and member_id not in (select x::uuid from jsonb_array_elements_text(p -> 'member_ids') x);
  end if;
  return v_id;
end;
$$;

create or replace function public.delete_calendar_event(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.calendar_events where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 個人設定（Dashboard）：只有本人能讀寫自己的設定
-- -----------------------------------------------------------------------------
create table public.member_preferences (
  member_id  uuid primary key references public.members (id) on delete cascade,
  dashboard  jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.member_preferences enable row level security;
create policy member_preferences_own on public.member_preferences for all to authenticated
  using (member_id = public.current_member_id()) with check (member_id = public.current_member_id());
grant select, insert, update, delete on public.member_preferences to authenticated;

-- 只保留已知的設定值
create or replace function public.save_dashboard_prefs(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_keys text[] := array['kpis', 'my_tasks', 'deadlines', 'projects', 'calendar', 'publications', 'meetings', 'quick_links'];
  v jsonb;
begin
  if public.current_member_id() is null then raise exception 'noPermission' using errcode = '42501'; end if;
  v := jsonb_build_object(
    'order', coalesce((select jsonb_agg(x order by o) from jsonb_array_elements_text(coalesce(p -> 'order', '[]')) with ordinality a(x, o)
                        where x = any (v_keys)), '[]'::jsonb),
    'hidden', coalesce((select jsonb_agg(distinct x) from jsonb_array_elements_text(coalesce(p -> 'hidden', '[]')) x
                         where x = any (v_keys)), '[]'::jsonb),
    'hide_empty', coalesce((p ->> 'hide_empty')::boolean, true),
    'scope', jsonb_build_object(
      'projects', case when p -> 'scope' ->> 'projects' in ('auto', 'mine', 'all') then p -> 'scope' ->> 'projects' else 'auto' end,
      'deadlines', case when p -> 'scope' ->> 'deadlines' in ('auto', 'mine', 'all') then p -> 'scope' ->> 'deadlines' else 'auto' end));
  insert into public.member_preferences (member_id, dashboard)
  values (public.current_member_id(), v)
  on conflict (member_id) do update set dashboard = excluded.dashboard, updated_at = now();
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- 全站搜尋、活動紀錄：加入行事曆活動
-- -----------------------------------------------------------------------------
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
     where m.name ilike p.pat or m.name_en ilike p.pat or m.email ilike p.pat
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

create or replace function public.list_activity(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', l.id, 'action', l.action, 'entity_type', l.entity_type, 'entity_id', l.entity_id,
           'entity_title', l.entity_title, 'changes', l.changes, 'created_at', l.created_at,
           'actor', public.member_brief(l.actor_id),
           -- 文件以網址代稱連結；已刪除的資料為 null（不顯示連結）
           'link_key', case l.entity_type
             when 'document' then (select d.slug from public.documents d where d.id = l.entity_id)
             when 'member' then (select m.id::text from public.members m where m.id = l.entity_id)
             when 'project' then (select x.id::text from public.projects x where x.id = l.entity_id)
             when 'task' then (select x.id::text from public.tasks x where x.id = l.entity_id)
             when 'publication' then (select x.id::text from public.publications x where x.id = l.entity_id)
             when 'meeting' then (select x.id::text from public.meetings x where x.id = l.entity_id)
             when 'faq' then (select x.id::text from public.faqs x where x.id = l.entity_id)
             when 'software_tool' then (select x.id::text from public.software_tools x where x.id = l.entity_id)
             when 'pipeline' then (select x.id::text from public.pipelines x where x.id = l.entity_id)
             -- 行事曆活動以日期連結（/calendar?date=）
             when 'calendar_event' then (select to_char(x.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD')
                                           from public.calendar_events x where x.id = l.entity_id)
           end
         ) order by l.created_at desc, l.id desc), '[]'::jsonb)
    from (select * from public.activity_log a
           where (p_filter ->> 'entity_type' is null or a.entity_type = p_filter ->> 'entity_type')
             and (p_filter ->> 'entity_id' is null or a.entity_id = (p_filter ->> 'entity_id')::uuid)
             and (p_filter ->> 'actor_id' is null or a.actor_id = (p_filter ->> 'actor_id')::uuid)
             and (p_filter ->> 'before' is null
                  or (a.created_at, a.id) < (select b.created_at, b.id from public.activity_log b
                                              where b.id = (p_filter ->> 'before')::bigint))
             and not (a.action = 'update' and a.changes is not null
                      and not exists (select 1 from jsonb_object_keys(a.changes) k
                                       where k not in ('user_id', 'updated_at', 'updated_by')))
           order by a.created_at desc, a.id desc
           limit least(greatest(coalesce((p_filter ->> 'limit')::int, 30), 1), 100)) l;
$$;

-- -----------------------------------------------------------------------------
-- Dashboard：專案標示 mine、未來 7 天行事曆、個人設定
-- -----------------------------------------------------------------------------
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
           o.name as owner_name,
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
           coalesce((select jsonb_agg(m.name order by m.name)
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

do $$
declare
  f text;
begin
  foreach f in array array['list_calendar(date, date, jsonb)', 'save_calendar_event(jsonb)', 'delete_calendar_event(uuid)',
                           'save_dashboard_prefs(jsonb)', 'search_all(text, integer)', 'list_activity(jsonb)', 'get_dashboard(integer)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

insert into public.page_settings (key, emoji, title, title_en)
values ('calendar', '📅', '行事曆', 'Calendar')
on conflict (key) do nothing;
