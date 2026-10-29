-- =============================================================================
-- TL Lab Hub — 14 會議紀錄附上連結
-- -----------------------------------------------------------------------------
-- meetings.links：[{label, url}]，例如投影片、錄影、共用文件；只保留 http(s) 網址
-- =============================================================================

alter table public.meetings add column if not exists links jsonb not null default '[]'::jsonb;

-- [{label, url}] 清理：去除空白、只留 http(s) 網址、最多 20 筆
create or replace function public.clean_links(p jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'url', l.url) order by l.ord), '[]'::jsonb)
    from (select trim(coalesce(x.v ->> 'label', '')) as label, public.clean_url(x.v ->> 'url') as url, x.ord
            from jsonb_array_elements(case when jsonb_typeof(p) = 'array' then p else '[]'::jsonb end)
                 with ordinality as x(v, ord)) l
   where l.url is not null and l.ord <= 20;
$$;

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
    'links', mt.links,
    'has_notes', coalesce(mt.summary, '') <> '' or coalesce(mt.decisions, '') <> '',
    'editable', public.can_edit_meeting(mt.id), 'deletable', public.can_delete_own(mt.created_by)
  );
$$;

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
    insert into public.meetings (title, emoji, type, starts_at, ends_at, location, decisions, links)
    values (v_title, coalesce(nullif(p ->> 'emoji', ''), '🗓️'),
            coalesce(nullif(p ->> 'type', ''), 'lab_meeting')::public.meeting_type, v_start, v_end,
            nullif(trim(coalesce(p ->> 'location', '')), ''), nullif(p ->> 'decisions', ''),
            public.clean_links(p -> 'links'))
    returning id into v_id;
  else
    update public.meetings
       set title = v_title, emoji = coalesce(nullif(p ->> 'emoji', ''), emoji),
           type = coalesce(nullif(p ->> 'type', ''), type::text)::public.meeting_type,
           starts_at = v_start, ends_at = v_end, location = nullif(trim(coalesce(p ->> 'location', '')), ''),
           decisions = nullif(p ->> 'decisions', ''),
           links = case when p ? 'links' then public.clean_links(p -> 'links') else links end
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

revoke execute on function public.clean_links(jsonb) from public, anon;
grant execute on function public.clean_links(jsonb) to authenticated;
