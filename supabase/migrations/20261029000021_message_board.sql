-- =============================================================================
-- TL Lab Hub — 21 留言板（Dashboard）
--   所有有帳號的成員（含唯讀）可以留言、回覆，@成員、#專案標註
--   內文中的標註格式：@[名稱](member uuid)、#[專案名稱](project uuid)
--   未登入訪客看不到
-- =============================================================================

create table public.board_posts (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.board_posts (id) on delete cascade,   -- 回覆（只有一層）
  body        text not null check (length(trim(body)) between 1 and 5000),
  author_id   uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  edited      boolean not null default false
);
create index board_posts_parent_idx on public.board_posts (parent_id, created_at);
create index board_posts_created_idx on public.board_posts (created_at desc, id desc) where parent_id is null;

create table public.board_post_mentions (
  post_id   uuid not null references public.board_posts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  primary key (post_id, member_id)
);
create index board_post_mentions_member_idx on public.board_post_mentions (member_id);

create table public.board_post_projects (
  post_id    uuid not null references public.board_posts (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (post_id, project_id)
);
create index board_post_projects_project_idx on public.board_post_projects (project_id);

alter table public.board_posts         enable row level security;
alter table public.board_post_mentions enable row level security;
alter table public.board_post_projects enable row level security;

-- 讀取：登入成員；寫入只透過下面的函式（security invoker，因此仍需 policy）
create policy board_posts_select on public.board_posts for select to authenticated
  using (public.current_member_id() is not null);
create policy board_posts_insert on public.board_posts for insert to authenticated
  with check (public.current_member_id() is not null and author_id = public.current_member_id());
create policy board_posts_update on public.board_posts for update to authenticated
  using (author_id = public.current_member_id()) with check (author_id = public.current_member_id());
create policy board_posts_delete on public.board_posts for delete to authenticated
  using (author_id = public.current_member_id() or public.is_admin());

do $$
declare
  t text;
begin
  foreach t in array array['board_post_mentions', 'board_post_projects'] loop
    execute format('create policy %I on public.%I for select to authenticated using (public.current_member_id() is not null)', t || '_select', t);
    execute format($p$create policy %I on public.%I for all to authenticated
      using (exists (select 1 from public.board_posts b where b.id = post_id and b.author_id = public.current_member_id()))
      with check (exists (select 1 from public.board_posts b where b.id = post_id and b.author_id = public.current_member_id()))$p$,
      t || '_write', t);
  end loop;
end;
$$;

revoke all on public.board_posts, public.board_post_mentions, public.board_post_projects from anon;

-- -----------------------------------------------------------------------------
-- JSON
-- -----------------------------------------------------------------------------
create or replace function public.board_post_json(b public.board_posts)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', b.id, 'parent_id', b.parent_id, 'body', b.body,
    'created_at', b.created_at, 'updated_at', b.updated_at, 'edited', b.edited,
    'author', public.member_brief(b.author_id),
    'mentions_me', exists (select 1 from public.board_post_mentions x
                            where x.post_id = b.id and x.member_id = public.current_member_id()),
    'projects', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'title', p.title, 'emoji', p.emoji) order by p.title)
                            from public.board_post_projects x join public.projects p on p.id = x.project_id
                           where x.post_id = b.id), '[]'::jsonb),
    'editable', b.author_id = public.current_member_id(),
    'deletable', b.author_id = public.current_member_id() or public.is_admin()
  );
$$;

-- 討論串：主留言（新到舊）＋回覆（舊到新）
--   filter.project_id：標註該專案（主留言或任一回覆）
--   filter.mine：提及我、或我發起／回覆過
--   filter.before：上一頁最後一則主留言的 id；filter.limit（預設 10，最多 50）
create or replace function public.list_board(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  with params as (
    select nullif(p_filter ->> 'project_id', '')::uuid as project_id,
           coalesce((p_filter ->> 'mine')::boolean, false) as mine,
           (select b.created_at from public.board_posts b where b.id = nullif(p_filter ->> 'before', '')::uuid) as before_at,
           nullif(p_filter ->> 'before', '')::uuid as before_id,
           least(greatest(coalesce((p_filter ->> 'limit')::int, 10), 1), 50) as lim,
           public.current_member_id() as me
  ),
  threads as (
    select b.*
      from public.board_posts b, params p
     where b.parent_id is null
       and (p.before_id is null or (b.created_at, b.id) < (p.before_at, p.before_id))
       and (p.project_id is null or exists (
             select 1 from public.board_posts r join public.board_post_projects x on x.post_id = r.id
              where (r.id = b.id or r.parent_id = b.id) and x.project_id = p.project_id))
       and (not p.mine or exists (
             select 1 from public.board_posts r
              where (r.id = b.id or r.parent_id = b.id)
                and (r.author_id = p.me
                     or exists (select 1 from public.board_post_mentions x where x.post_id = r.id and x.member_id = p.me))))
     order by b.created_at desc, b.id desc
     limit (select lim from params)
  )
  select coalesce(jsonb_agg(public.board_post_json(t) || jsonb_build_object(
           'replies', coalesce((select jsonb_agg(public.board_post_json(r) order by r.created_at, r.id)
                                  from public.board_posts r where r.parent_id = t.id), '[]'::jsonb))
         order by t.created_at desc, t.id desc), '[]'::jsonb)
    from threads t;
$$;

-- 新增／修改留言：p = {id?, parent_id?, body}；回傳 id
-- 內文中的 @[..](uuid)、#[..](uuid) 會同步到 mentions／projects（不存在的 id 忽略）
create or replace function public.save_board_post(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id     uuid := nullif(p ->> 'id', '')::uuid;
  v_parent uuid := nullif(p ->> 'parent_id', '')::uuid;
  v_body   text := trim(coalesce(p ->> 'body', ''));
begin
  if public.current_member_id() is null then
    raise exception 'noPermission' using errcode = '42501';
  end if;
  if v_body = '' then raise exception 'contentRequired' using errcode = '22023'; end if;
  if length(v_body) > 5000 then raise exception 'contentTooLong' using errcode = '22023'; end if;

  if v_id is null then
    if v_parent is not null then
      -- 回覆只有一層：回覆的回覆掛到同一個主留言
      select coalesce(parent_id, id) into v_parent from public.board_posts where id = v_parent;
      if v_parent is null then raise exception 'notFound' using errcode = 'P0002'; end if;
    end if;
    insert into public.board_posts (parent_id, body) values (v_parent, v_body) returning id into v_id;
  else
    update public.board_posts set body = v_body, edited = true, updated_at = now()
     where id = v_id and author_id = public.current_member_id();
    if not found then raise exception 'noPermission' using errcode = '42501'; end if;
    delete from public.board_post_mentions where post_id = v_id;
    delete from public.board_post_projects where post_id = v_id;
  end if;

  insert into public.board_post_mentions (post_id, member_id)
  select distinct v_id, m.id
    from regexp_matches(v_body, '@\[[^\]\n]+\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)', 'g') x
    join public.members m on m.id = x[1]::uuid
  on conflict do nothing;
  insert into public.board_post_projects (post_id, project_id)
  select distinct v_id, pr.id
    from regexp_matches(v_body, '#\[[^\]\n]+\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)', 'g') x
    join public.projects pr on pr.id = x[1]::uuid
  on conflict do nothing;
  return v_id;
end;
$$;

create or replace function public.delete_board_post(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.board_posts where id = p_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

revoke execute on function public.board_post_json(public.board_posts), public.list_board(jsonb),
  public.save_board_post(jsonb), public.delete_board_post(uuid) from public, anon;
grant execute on function public.board_post_json(public.board_posts), public.list_board(jsonb),
  public.save_board_post(jsonb), public.delete_board_post(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Dashboard 設定：加入 board 區塊
-- -----------------------------------------------------------------------------
create or replace function public.save_dashboard_prefs(p jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_keys text[] := array['kpis', 'board', 'my_tasks', 'deadlines', 'projects', 'calendar', 'publications', 'meetings', 'quick_links'];
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
