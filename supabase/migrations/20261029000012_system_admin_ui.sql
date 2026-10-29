-- =============================================================================
-- TL Lab Hub — 12 以網頁管理系統管理員
-- -----------------------------------------------------------------------------
-- * is_system_admin 只在 app_role = 'admin'（且非校友）時有效
-- * 系統管理員可在成員編輯視窗勾選／取消其他 Admin 為系統管理員，
--   和 app_role 一樣由 save_member() 儲存；其他人送來的值會被忽略
-- * 不再是 Admin 或成為校友時自動取消（members_protect_admin，migration 11）
-- =============================================================================

create or replace function public.is_system_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select m.is_system_admin and m.app_role = 'admin' and not m.is_alumni
                     from public.members m where m.user_id = auth.uid()), false);
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
         sort_order = case when v_admin and p ? 'sort_order' then coalesce(nullif(p ->> 'sort_order', '')::int, 0) else m.sort_order end,
         -- 系統管理員：只有系統管理員能設定；不是 Admin（或為校友）時由 trigger 自動取消
         is_system_admin = case when public.is_system_admin() and p ? 'is_system_admin'
                                then coalesce((p ->> 'is_system_admin')::boolean, false) else m.is_system_admin end
   where m.id = v_id;
  if not found then raise exception 'noPermission' using errcode = '42501'; end if;
  return v_id;
end;
$$;
