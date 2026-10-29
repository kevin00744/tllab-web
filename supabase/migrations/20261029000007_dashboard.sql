-- =============================================================================
-- TL Lab Hub — 07 Dashboard 資料
-- 首頁所需資料一次取回（台灣 ↔ Supabase 東京只需一次往返）
-- security invoker：依呼叫者的 RLS 權限回傳
-- =============================================================================

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
    'projects', coalesce((select jsonb_agg(to_jsonb(p) - 'rn' order by p.rn) from projects p where p.rn <= 8), '[]'::jsonb),
    'publication_stages', coalesce((select jsonb_agg(to_jsonb(s) order by s.stage) from stages s), '[]'::jsonb),
    'recent_meetings', coalesce((select jsonb_agg(to_jsonb(m) - 'rn' order by m.rn) from recent_meetings m where m.rn <= 3), '[]'::jsonb),
    'next_meeting', (select to_jsonb(n) from next_meeting n),
    'deadlines', coalesce((select jsonb_agg(to_jsonb(d) - 'rn' order by d.rn) from deadlines d where d.rn <= 30), '[]'::jsonb)
  );
$$;

revoke execute on function public.get_dashboard(integer) from public, anon;
grant execute on function public.get_dashboard(integer) to authenticated;
