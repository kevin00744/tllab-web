-- =============================================================================
-- TL Lab Hub — 11 系統管理員
-- -----------------------------------------------------------------------------
-- * 系統管理員（is_system_admin）同時是 Admin，預設給 PI
-- * 管理員的身分（權限、校友、Email、職稱）只有系統管理員可以變更，
--   也只有系統管理員可以刪除管理員、重設管理員的密碼
-- * 指定或移交系統管理員只能在 SQL Editor 進行（見 README 6-3）
-- =============================================================================

alter table public.members add column if not exists is_system_admin boolean not null default false;
alter table public.members drop constraint if exists members_system_admin_is_admin;
alter table public.members add constraint members_system_admin_is_admin
  check (not is_system_admin or (app_role = 'admin' and not is_alumni));

-- 現有的 PI（Admin、非校友）設為系統管理員
update public.members set is_system_admin = true
 where position = 'pi' and app_role = 'admin' and not is_alumni and not is_system_admin;

create or replace function public.is_system_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select m.is_system_admin from public.members m where m.user_id = auth.uid()), false);
$$;

-- 保護管理員：一般 Admin 不能變更或刪除其他管理員（也不能變更自己的身分）
create or replace function public.members_protect_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.app_role <> 'admin' or new.is_alumni) then
    new.is_system_admin := false;  -- 不再是 Admin 或成為校友時，一併取消系統管理員
  end if;

  -- auth.uid() 為 null 代表 service role / SQL editor / seed
  if auth.uid() is not null and not public.is_system_admin() then
    if tg_op = 'DELETE' then
      if old.app_role = 'admin' then raise exception 'adminProtected' using errcode = '42501'; end if;
    elsif new.is_system_admin is distinct from old.is_system_admin
       or (old.app_role = 'admin'
           and (new.app_role  is distinct from old.app_role
             or new.is_alumni is distinct from old.is_alumni
             or new.email     is distinct from old.email
             or new.position  is distinct from old.position
             or new.user_id   is distinct from old.user_id)) then
      raise exception 'adminProtected' using errcode = '42501';
    end if;
  end if;

  if old.is_system_admin and (tg_op = 'DELETE' or not new.is_system_admin)
     and not exists (select 1 from public.members where is_system_admin and id <> old.id) then
    raise exception '系統至少需要保留一位系統管理員' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists members_protect_admin on public.members;
-- 名稱排在 members_keep_admin 之後（trigger 依名稱順序執行），讓「至少一位 Admin」先檢查
create trigger members_protect_admin before update or delete on public.members
  for each row execute function public.members_protect_admin();

-- 成員 JSON：加上系統管理員與「目前使用者能否管理此成員」
create or replace function public.member_json(m public.members)
returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', m.id, 'name', m.name, 'name_en', m.name_en, 'email', m.email, 'avatar_url', m.avatar_url,
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

-- 重設密碼前取得帳號 id：管理員的帳號只有系統管理員（或本人）可以重設
create or replace function public.member_user_id(p_id uuid)
returns uuid
language plpgsql stable
set search_path = ''
as $$
begin
  if not public.is_admin() then raise exception 'noPermission' using errcode = '42501'; end if;
  if p_id <> public.current_member_id() and not public.is_system_admin()
     and exists (select 1 from public.members where id = p_id and app_role = 'admin') then
    raise exception 'adminProtected' using errcode = '42501';
  end if;
  return (select user_id from public.members where id = p_id);
end;
$$;

revoke execute on function public.is_system_admin() from public, anon;
grant execute on function public.is_system_admin() to authenticated;
