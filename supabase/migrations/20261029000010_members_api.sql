-- =============================================================================
-- TL Lab Hub — 10 成員與邀請碼管理 API（階段 5）
-- -----------------------------------------------------------------------------
-- * 本人可修改自己的個人資料；職稱、權限、Email、校友狀態只有 Admin 能改
--   （members_guard_privileged trigger 另外把關權限／Email／校友狀態）
-- * 錯誤碼同 migration 08：42501 沒有權限、22023 輸入不正確
-- =============================================================================

create or replace function public.member_json(m public.members)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'name_en', m.name_en, 'email', m.email, 'avatar_url', m.avatar_url,
    'position', m.position, 'app_role', m.app_role, 'is_alumni', m.is_alumni,
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
    'is_me', m.id = public.current_member_id()
  );
$$;

-- 篩選：position / alumni（true=只看校友）/ q
create or replace function public.list_members(p_filter jsonb default '{}'::jsonb)
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(public.member_json(m)
                            order by m.is_alumni,
                                     array_position(array['pi', 'postdoc', 'phd', 'master', 'undergrad', 'staff']::public.member_position[], m.position),
                                     m.sort_order, m.join_year nulls last, m.name), '[]'::jsonb)
    from public.members m
   where (p_filter ->> 'position' is null or m.position::text = p_filter ->> 'position')
     and (p_filter ->> 'alumni' is null or m.is_alumni = (p_filter ->> 'alumni')::boolean)
     and (coalesce(p_filter ->> 'q', '') = ''
          or m.name ilike public.like_pattern(p_filter ->> 'q')
          or m.name_en ilike public.like_pattern(p_filter ->> 'q')
          or m.email ilike public.like_pattern(p_filter ->> 'q')
          or array_to_string(m.research_interests, ' ') ilike public.like_pattern(p_filter ->> 'q'));
$$;

create or replace function public.get_member(p_id uuid)
returns jsonb
language sql stable
set search_path = ''
as $$
  select public.member_json(m) || jsonb_build_object(
    'publications', public.list_publications(jsonb_build_object('member_id', m.id)),
    'tasks', (select coalesce(jsonb_agg(x), '[]'::jsonb)
                from jsonb_array_elements(public.list_tasks(jsonb_build_object('member_id', m.id))) x
               where x ->> 'status' <> 'done')
  )
    from public.members m where m.id = p_id;
$$;

create or replace function public.save_member(p jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_admin boolean := public.is_admin();
  v_name text := trim(coalesce(p ->> 'name', ''));
  v_email text := nullif(lower(trim(coalesce(p ->> 'email', ''))), '');
  v_interests text[] := coalesce((select array_agg(distinct trim(x)) from jsonb_array_elements_text(coalesce(p -> 'research_interests', '[]')) x
                                   where trim(x) <> ''), '{}');
  v_links jsonb := coalesce((
    select jsonb_agg(jsonb_build_object('label', trim(l ->> 'label'), 'url', trim(l ->> 'url')))
      from jsonb_array_elements(coalesce(p -> 'links', '[]')) l
     where trim(coalesce(l ->> 'url', '')) ~* '^https?://'), '[]'::jsonb);
begin
  if v_name = '' then raise exception 'nameRequired' using errcode = '22023'; end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'emailInvalid' using errcode = '22023';
  end if;

  if v_id is null then
    if not v_admin then raise exception 'noPermission' using errcode = '42501'; end if;
    if v_email is not null and exists (select 1 from public.members where lower(email) = v_email) then
      raise exception 'emailTaken' using errcode = '22023';
    end if;
    insert into public.members (name, name_en, email, position, app_role, is_alumni, research_interests, bio,
                                join_year, left_year, current_affiliation, links)
    values (v_name, nullif(trim(p ->> 'name_en'), ''), v_email,
            coalesce(nullif(p ->> 'position', ''), 'undergrad')::public.member_position,
            coalesce(nullif(p ->> 'app_role', ''), 'member')::public.app_role,
            coalesce((p ->> 'is_alumni')::boolean, false), v_interests, nullif(p ->> 'bio', ''),
            nullif(p ->> 'join_year', '')::smallint, nullif(p ->> 'left_year', '')::smallint,
            nullif(trim(p ->> 'current_affiliation'), ''), v_links)
    returning id into v_id;
    return v_id;
  end if;

  if v_admin and v_email is not null and exists (select 1 from public.members where lower(email) = v_email and id <> v_id) then
    raise exception 'emailTaken' using errcode = '22023';
  end if;

  update public.members m
     set name = v_name,
         name_en = nullif(trim(p ->> 'name_en'), ''),
         research_interests = v_interests,
         bio = nullif(p ->> 'bio', ''),
         join_year = nullif(p ->> 'join_year', '')::smallint,
         left_year = nullif(p ->> 'left_year', '')::smallint,
         current_affiliation = nullif(trim(p ->> 'current_affiliation'), ''),
         links = v_links,
         avatar_url = case when p ? 'avatar_url' then nullif(p ->> 'avatar_url', '') else m.avatar_url end,
         -- 以下僅 Admin 可修改；一般成員送來的值會被忽略
         position = case when v_admin then coalesce(nullif(p ->> 'position', ''), m.position::text)::public.member_position else m.position end,
         app_role = case when v_admin then coalesce(nullif(p ->> 'app_role', ''), m.app_role::text)::public.app_role else m.app_role end,
         is_alumni = case when v_admin and p ? 'is_alumni' then (p ->> 'is_alumni')::boolean else m.is_alumni end,
         email = case when v_admin and p ? 'email' then v_email else m.email end,
         sort_order = case when v_admin and p ? 'sort_order' then coalesce(nullif(p ->> 'sort_order', '')::int, 0) else m.sort_order end
   where m.id = v_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  return v_id;
end;
$$;

-- 刪除成員：回傳原本綁定的登入帳號 id，讓伺服器一併刪除帳號
create or replace function public.delete_member(p_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user uuid;
begin
  if p_id = public.current_member_id() then
    raise exception 'cannotDeleteSelf' using errcode = '22023';
  end if;
  delete from public.members where id = p_id returning user_id into v_user;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  return v_user;
end;
$$;

-- 成員的登入帳號 id（Admin 重設密碼用）
create or replace function public.member_user_id(p_id uuid)
returns uuid
language plpgsql stable
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'noPermission' using errcode = '42501'; end if;
  return (select user_id from public.members where id = p_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 邀請碼管理（Admin）
-- -----------------------------------------------------------------------------
create or replace function public.list_invite_codes()
returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', ic.id, 'code_hint', ic.code_hint, 'note', ic.note, 'app_role', ic.app_role, 'position', ic.position,
           'email', ic.email, 'member', public.member_brief(ic.member_id),
           'max_uses', ic.max_uses, 'used_count', ic.used_count, 'expires_at', ic.expires_at, 'revoked_at', ic.revoked_at,
           'created_at', ic.created_at, 'created_by', public.member_brief(ic.created_by),
           'status', case when ic.revoked_at is not null then 'revoked'
                          when ic.used_count >= ic.max_uses then 'used'
                          when ic.expires_at <= now() then 'expired'
                          else 'active' end,
           'redeemed_by', coalesce((select jsonb_agg(r.email order by r.redeemed_at) from public.invite_redemptions r
                                    where r.invite_id = ic.id), '[]'::jsonb)
         ) order by ic.created_at desc), '[]'::jsonb)
    from public.invite_codes ic;
$$;

create or replace function public.revoke_invite_code(p_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.invite_codes set revoked_at = now() where id = p_id and revoked_at is null;
  if not found and not public.is_admin() then raise exception 'noPermission' using errcode = '42501'; end if;
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array['member_json(public.members)', 'list_members(jsonb)', 'get_member(uuid)', 'save_member(jsonb)',
                           'delete_member(uuid)', 'member_user_id(uuid)', 'list_invite_codes()', 'revoke_invite_code(uuid)']
  loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
