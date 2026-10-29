-- =============================================================================
-- TL Lab Hub — 03 活動紀錄、全站搜尋、Dashboard 檢視、Action item 轉 Task
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 活動紀錄：主要資料表的新增／修改／刪除自動寫入 activity_log
-- -----------------------------------------------------------------------------
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
  v_changes jsonb;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value))
      into v_changes
      from jsonb_each(v_new) n
     where n.key not in ('updated_at', 'updated_by', 'position', 'sort_order')
       and n.value is distinct from v_old -> n.key;
    -- 只有排序或時間戳變動時不記錄
    if v_changes is null then
      return new;
    end if;
  end if;

  insert into public.activity_log (actor_id, action, entity_type, entity_id, entity_title, changes)
  values (
    public.current_member_id(),
    lower(tg_op),
    v_entity_type,
    (v_row ->> 'id')::uuid,
    coalesce(v_row ->> 'title', v_row ->> 'name', v_row ->> 'question', v_row ->> 'content'),
    v_changes
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('members',        'member'),
      ('projects',       'project'),
      ('tasks',          'task'),
      ('publications',   'publication'),
      ('meetings',       'meeting'),
      ('documents',      'document'),
      ('faqs',           'faq'),
      ('software_tools', 'software_tool'),
      ('pipelines',      'pipeline')
    ) as v(tbl, entity)
  loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.log_activity(%L)',
      r.tbl || '_activity', r.tbl, r.entity);
  end loop;
end;
$$;

-- 指派變更記在任務底下（例如「A 將任務指派給 B」）
create or replace function public.log_task_assignment()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.task_assignees := coalesce(new, old);
begin
  insert into public.activity_log (actor_id, action, entity_type, entity_id, entity_title, changes)
  select public.current_member_id(), 'update', 'task', t.id, t.title,
         jsonb_build_object(
           case when tg_op = 'INSERT' then 'assignee_added' else 'assignee_removed' end,
           jsonb_build_object('member_id', v_row.member_id, 'name', m.name))
    from public.tasks t
    left join public.members m on m.id = v_row.member_id
   where t.id = v_row.task_id;
  return v_row;
end;
$$;

create trigger task_assignees_activity after insert or delete on public.task_assignees
  for each row execute function public.log_task_assignment();

-- 資料刪除時一併清除多型附件紀錄（Storage 實體檔由應用程式端刪除）
create or replace function public.cleanup_attachments()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.attachments where entity_type = tg_argv[0] and entity_id = old.id;
  return old;
end;
$$;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('members', 'member'), ('projects', 'project'), ('tasks', 'task'),
      ('publications', 'publication'), ('meetings', 'meeting'), ('documents', 'document'),
      ('faqs', 'faq'), ('software_tools', 'software_tool'), ('pipelines', 'pipeline')
    ) as v(tbl, entity)
  loop
    execute format(
      'create trigger %I after delete on public.%I
         for each row execute function public.cleanup_attachments(%L)',
      r.tbl || '_attachments_cleanup', r.tbl, r.entity);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 全站搜尋（成員、專案、任務、論文、會議、文件、FAQ、軟體、Pipelines）
-- 使用 ILIKE + pg_trgm，中英文皆可部分比對；以 security invoker 執行，遵守 RLS
-- -----------------------------------------------------------------------------
create or replace function public.search_all(q text, max_results integer default 30)
returns table (
  entity_type text,
  id          uuid,
  title       text,
  subtitle    text,
  emoji       text,
  score       real
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
           '👤'::text, similarity(m.name || ' ' || coalesce(m.name_en, ''), p.term)
      from members m, params p
     where m.name ilike p.pat or m.name_en ilike p.pat or m.email ilike p.pat
        or array_to_string(m.research_interests, ' ') ilike p.pat
    union all
    select 'project', pr.id, pr.title, left(pr.description, 120), pr.emoji, similarity(pr.title, p.term)
      from projects pr, params p
     where pr.title ilike p.pat or pr.description ilike p.pat or array_to_string(pr.tags, ' ') ilike p.pat
    union all
    select 'task', t.id, t.title, left(t.description, 120), '✅', similarity(t.title, p.term)
      from tasks t, params p
     where t.title ilike p.pat or t.description ilike p.pat
    union all
    select 'publication', pb.id, pb.title, pb.venue, pb.emoji, similarity(pb.title, p.term)
      from publications pb, params p
     where pb.title ilike p.pat or pb.venue ilike p.pat or pb.doi ilike p.pat or pb.notes ilike p.pat
    union all
    select 'meeting', mt.id, mt.title, to_char(mt.starts_at at time zone 'Asia/Taipei', 'YYYY-MM-DD'), mt.emoji,
           similarity(mt.title, p.term)
      from meetings mt, params p
     where mt.title ilike p.pat or mt.summary ilike p.pat or mt.decisions ilike p.pat
    union all
    select 'document', d.id, d.title, left(d.content, 120), d.emoji, similarity(d.title, p.term)
      from documents d, params p
     where d.title ilike p.pat or d.content ilike p.pat
    union all
    select 'faq', f.id, f.question, f.category, '❓', similarity(f.question, p.term)
      from faqs f, params p
     where f.question ilike p.pat or f.answer ilike p.pat
    union all
    select 'software_tool', s.id, s.name, s.purpose, s.emoji, similarity(s.name, p.term)
      from software_tools s, params p
     where s.name ilike p.pat or s.purpose ilike p.pat or s.category ilike p.pat
    union all
    select 'pipeline', pl.id, pl.name, left(pl.description, 120), pl.emoji, similarity(pl.name, p.term)
      from pipelines pl, params p
     where pl.name ilike p.pat or pl.description ilike p.pat
  )
  select * from hits h(entity_type, id, title, subtitle, emoji, score)
   where length(trim(q)) > 0
   order by h.score desc, h.title
   limit greatest(1, least(max_results, 100));
$$;

-- -----------------------------------------------------------------------------
-- Action item → Task（一鍵轉換）
-- 以呼叫者身分執行（遵守 RLS）；任務歸屬會議的第一個關聯專案
-- -----------------------------------------------------------------------------
create or replace function public.convert_action_item_to_task(p_action_item_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_item public.action_items;
  v_task_id uuid;
  v_project_id uuid;
begin
  select * into v_item from public.action_items where id = p_action_item_id;
  if not found then
    raise exception 'Action item 不存在' using errcode = 'P0002';
  end if;
  if v_item.task_id is not null then
    return v_item.task_id;
  end if;
  if auth.uid() is not null
     and not (public.can_edit_meeting(v_item.meeting_id)
              or (public.is_editor() and v_item.assignee_id = public.current_member_id())) then
    raise exception '沒有權限轉換此 Action item' using errcode = '42501';
  end if;

  select mp.project_id into v_project_id
    from public.meeting_projects mp
    join public.projects p on p.id = mp.project_id
   where mp.meeting_id = v_item.meeting_id
   order by p.created_at
   limit 1;

  insert into public.tasks (title, project_id, meeting_id, due_date, priority, status)
  values (v_item.content, v_project_id, v_item.meeting_id, v_item.due_date, 'medium',
          case when v_item.is_done then 'done'::public.task_status else 'todo'::public.task_status end)
  returning id into v_task_id;

  if v_item.assignee_id is not null then
    insert into public.task_assignees (task_id, member_id) values (v_task_id, v_item.assignee_id);
  end if;

  update public.action_items set task_id = v_task_id where id = v_item.id and task_id is null;
  if not found then
    -- 同時被他人轉換：整筆交易回滾，避免產生重複任務
    raise exception 'Action item 已被轉換，請重新整理' using errcode = '40001';
  end if;
  return v_task_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Dashboard 檢視（security_invoker = 依呼叫者 RLS）
-- -----------------------------------------------------------------------------

-- 專案進度總覽：手動進度 + 由任務完成率推算的進度
create view public.v_project_overview with (security_invoker = true) as
select
  p.id, p.title, p.emoji, p.status, p.owner_id, p.start_date, p.due_date, p.progress, p.tags,
  count(t.id)                                                         as task_total,
  count(t.id) filter (where t.status = 'done')                        as task_done,
  count(t.id) filter (where t.status <> 'done' and t.due_date < public.lab_today()) as task_overdue,
  case when count(t.id) = 0 then null
       else round(100.0 * count(t.id) filter (where t.status = 'done') / count(t.id))::int
  end                                                                 as task_progress
from public.projects p
left join public.tasks t on t.project_id = p.id
group by p.id;

-- 近期截止日：未完成任務 + 尚未接受的論文 deadline
create view public.v_upcoming_deadlines with (security_invoker = true) as
select 'task'::text as kind, t.id, t.title, '✅'::text as emoji, t.due_date,
       t.status::text as status, t.priority::text as priority, t.project_id,
       array(select ta.member_id from public.task_assignees ta where ta.task_id = t.id) as member_ids
  from public.tasks t
 where t.status <> 'done' and t.due_date is not null
union all
select 'publication', pb.id, pb.title, pb.emoji, pb.deadline,
       pb.stage::text, null, pb.project_id,
       array(select pa.member_id from public.publication_authors pa
              where pa.publication_id = pb.id and pa.member_id is not null)
  from public.publications pb
 where pb.stage not in ('accepted', 'published') and pb.deadline is not null;

-- 論文各階段數量
create view public.v_publication_stage_counts with (security_invoker = true) as
select s.stage, count(pb.id)::int as total
  from unnest(enum_range(null::public.publication_stage)) as s(stage)
  left join public.publications pb on pb.stage = s.stage
 group by s.stage
 order by s.stage;

-- KPI 卡片
create or replace function public.dashboard_kpis()
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'active_projects',
      (select count(*) from public.projects where status = 'active'),
    'tasks_due_this_week',
      (select count(*) from public.tasks
        where status <> 'done'
          and due_date between date_trunc('week', public.lab_today())::date
                           and (date_trunc('week', public.lab_today()) + interval '6 days')::date),
    'tasks_overdue',
      (select count(*) from public.tasks where status <> 'done' and due_date < public.lab_today()),
    'publications_published_this_year',
      (select count(*) from public.publications
        where stage = 'published'
          and extract(year from coalesce(published_at, updated_at::date)) = extract(year from public.lab_today())),
    'publications_under_submission',
      (select count(*) from public.publications where stage in ('submitted', 'revision'))
  );
$$;

grant select on public.v_project_overview, public.v_upcoming_deadlines, public.v_publication_stage_counts
  to authenticated;
revoke all on public.v_project_overview, public.v_upcoming_deadlines, public.v_publication_stage_counts
  from anon;
revoke execute on function public.search_all(text, integer), public.convert_action_item_to_task(uuid),
  public.dashboard_kpis() from public, anon;
grant execute on function public.search_all(text, integer), public.convert_action_item_to_task(uuid),
  public.dashboard_kpis() to authenticated;
