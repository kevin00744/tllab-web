-- =============================================================================
-- TL Lab Hub — 02 登入綁定與權限（Row Level Security）
-- -----------------------------------------------------------------------------
-- 權限三級：
--   admin  : 所有資料可讀寫、管理成員與權限
--   member : 可新增內容；可編輯／刪除「自己相關」的內容
--            （自己建立的、被指派的、參與的專案、身為作者或出席者、負責維護的）
--   viewer : 唯讀
-- 未登入（anon）：無任何存取權
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 新使用者登入（Google / Email）→ 綁定或建立 members
--   * Admin 事先以 email 建立成員 → 首次登入自動綁定，沿用預設的 app_role
--   * 未預先建立的帳號 → 以 viewer 身分建立，等待 Admin 調整
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if new.email is not null then
    update public.members m
       set user_id    = new.id,
           avatar_url = coalesce(m.avatar_url, v_meta ->> 'avatar_url', v_meta ->> 'picture')
     where lower(m.email) = lower(new.email)
       and m.user_id is null
    returning m.id into v_member_id;
  end if;

  if v_member_id is null then
    insert into public.members (user_id, name, email, avatar_url, app_role)
    values (
      new.id,
      coalesce(v_meta ->> 'full_name', v_meta ->> 'name', split_part(new.email, '@', 1), '新成員'),
      new.email,
      coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture'),
      'viewer'
    );
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- 非 Admin 不能修改自己的權限、帳號綁定、校友狀態
create or replace function public.members_guard_privileged()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- auth.uid() 為 null 代表 service role / SQL editor / seed，允許
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.app_role  is distinct from old.app_role
     or new.user_id   is distinct from old.user_id
     or new.email     is distinct from old.email
     or new.is_alumni is distinct from old.is_alumni then
    raise exception '只有 Admin 可以修改權限、帳號綁定、Email 或校友狀態'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger members_guard before update on public.members
  for each row execute function public.members_guard_privileged();

-- 避免移除最後一位 Admin
create or replace function public.members_keep_one_admin()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.app_role = 'admin'
     and (tg_op = 'DELETE' or new.app_role <> 'admin')
     and not exists (select 1 from public.members where app_role = 'admin' and id <> old.id) then
    raise exception '系統至少需要保留一位 Admin';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger members_keep_admin before update of app_role or delete on public.members
  for each row execute function public.members_keep_one_admin();

-- -----------------------------------------------------------------------------
-- 「自己相關」判斷函式（security definer，避免 policy 之間互相遞迴）
-- -----------------------------------------------------------------------------
create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (
    public.is_editor() and exists (
      select 1 from public.projects p
       where p.id = p_project_id
         and (p.owner_id = public.current_member_id()
              or p.created_by = public.current_member_id()
              or exists (select 1 from public.project_members pm
                          where pm.project_id = p.id
                            and pm.member_id = public.current_member_id()))
    )
  );
$$;

create or replace function public.can_edit_task(p_task_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (
    public.is_editor() and exists (
      select 1 from public.tasks t
       where t.id = p_task_id
         and (t.created_by = public.current_member_id()
              or exists (select 1 from public.task_assignees ta
                          where ta.task_id = t.id
                            and ta.member_id = public.current_member_id())
              or (t.project_id is not null and public.can_edit_project(t.project_id)))
    )
  );
$$;

create or replace function public.can_edit_publication(p_publication_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (
    public.is_editor() and exists (
      select 1 from public.publications pub
       where pub.id = p_publication_id
         and (pub.created_by = public.current_member_id()
              or exists (select 1 from public.publication_authors pa
                          where pa.publication_id = pub.id
                            and pa.member_id = public.current_member_id())
              or (pub.project_id is not null and public.can_edit_project(pub.project_id)))
    )
  );
$$;

create or replace function public.can_edit_meeting(p_meeting_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (
    public.is_editor() and exists (
      select 1 from public.meetings mt
       where mt.id = p_meeting_id
         and (mt.created_by = public.current_member_id()
              or exists (select 1 from public.meeting_attendees ma
                          where ma.meeting_id = mt.id
                            and ma.member_id = public.current_member_id()))
    )
  );
$$;

create or replace function public.can_edit_pipeline(p_pipeline_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_admin() or (
    public.is_editor() and exists (
      select 1 from public.pipelines pl
       where pl.id = p_pipeline_id
         and (pl.created_by = public.current_member_id()
              or pl.maintainer_id = public.current_member_id())
    )
  );
$$;

-- 附件權限跟隨所屬資料
create or replace function public.can_edit_entity(p_entity_type text, p_entity_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case p_entity_type
    when 'project'     then public.can_edit_project(p_entity_id)
    when 'task'        then public.can_edit_task(p_entity_id)
    when 'publication' then public.can_edit_publication(p_entity_id)
    when 'meeting'     then public.can_edit_meeting(p_entity_id)
    when 'pipeline'    then public.can_edit_pipeline(p_entity_id)
    when 'member'      then public.is_admin() or p_entity_id = public.current_member_id()
    -- documents / faq / software_tool：協作型文件，所有 member 皆可附加檔案
    else public.is_editor()
  end;
$$;

-- -----------------------------------------------------------------------------
-- 啟用 RLS
-- -----------------------------------------------------------------------------
alter table public.members             enable row level security;
alter table public.projects            enable row level security;
alter table public.project_members     enable row level security;
alter table public.publications        enable row level security;
alter table public.publication_authors enable row level security;
alter table public.meetings            enable row level security;
alter table public.meeting_attendees   enable row level security;
alter table public.meeting_projects    enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_assignees      enable row level security;
alter table public.action_items        enable row level security;
alter table public.documents           enable row level security;
alter table public.faqs                enable row level security;
alter table public.software_tools      enable row level security;
alter table public.pipelines           enable row level security;
alter table public.pipeline_steps      enable row level security;
alter table public.attachments         enable row level security;
alter table public.page_settings       enable row level security;
alter table public.activity_log        enable row level security;

-- -----------------------------------------------------------------------------
-- 讀取：所有已登入且有成員資料者（含 viewer）皆可讀
-- -----------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'members', 'projects', 'project_members', 'publications', 'publication_authors',
    'meetings', 'meeting_attendees', 'meeting_projects', 'tasks', 'task_assignees',
    'action_items', 'documents', 'faqs', 'software_tools', 'pipelines', 'pipeline_steps',
    'attachments', 'page_settings', 'activity_log']
  loop
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.current_member_id() is not null)',
      t || '_select', t);
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- members
-- -----------------------------------------------------------------------------
create policy members_insert on public.members for insert to authenticated
  with check (public.is_admin());
create policy members_update on public.members for update to authenticated
  using (public.is_admin() or id = public.current_member_id())
  with check (public.is_admin() or id = public.current_member_id());
create policy members_delete on public.members for delete to authenticated
  using (public.is_admin());

-- -----------------------------------------------------------------------------
-- projects / project_members
-- -----------------------------------------------------------------------------
create policy projects_insert on public.projects for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy projects_update on public.projects for update to authenticated
  using (public.can_edit_project(id)) with check (public.is_editor());
create policy projects_delete on public.projects for delete to authenticated
  using (public.is_admin()
         or (public.is_editor() and (owner_id = public.current_member_id()
                                     or created_by = public.current_member_id())));

create policy project_members_write on public.project_members for all to authenticated
  using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

-- -----------------------------------------------------------------------------
-- tasks / task_assignees
-- -----------------------------------------------------------------------------
create policy tasks_insert on public.tasks for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy tasks_update on public.tasks for update to authenticated
  using (public.can_edit_task(id)) with check (public.is_editor());
create policy tasks_delete on public.tasks for delete to authenticated
  using (public.is_admin()
         or (public.is_editor() and (created_by = public.current_member_id()
                                     or (project_id is not null and public.can_edit_project(project_id)))));

create policy task_assignees_write on public.task_assignees for all to authenticated
  using (public.can_edit_task(task_id)) with check (public.can_edit_task(task_id));

-- -----------------------------------------------------------------------------
-- publications / publication_authors
-- -----------------------------------------------------------------------------
create policy publications_insert on public.publications for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy publications_update on public.publications for update to authenticated
  using (public.can_edit_publication(id)) with check (public.is_editor());
create policy publications_delete on public.publications for delete to authenticated
  using (public.is_admin()
         or (public.is_editor() and created_by = public.current_member_id()));

create policy publication_authors_write on public.publication_authors for all to authenticated
  using (public.can_edit_publication(publication_id))
  with check (public.can_edit_publication(publication_id));

-- -----------------------------------------------------------------------------
-- meetings / attendees / meeting_projects / action_items
-- -----------------------------------------------------------------------------
create policy meetings_insert on public.meetings for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy meetings_update on public.meetings for update to authenticated
  using (public.can_edit_meeting(id)) with check (public.is_editor());
create policy meetings_delete on public.meetings for delete to authenticated
  using (public.is_admin()
         or (public.is_editor() and created_by = public.current_member_id()));

create policy meeting_attendees_write on public.meeting_attendees for all to authenticated
  using (public.can_edit_meeting(meeting_id)) with check (public.can_edit_meeting(meeting_id));
create policy meeting_projects_write on public.meeting_projects for all to authenticated
  using (public.can_edit_meeting(meeting_id)) with check (public.can_edit_meeting(meeting_id));

create policy action_items_insert on public.action_items for insert to authenticated
  with check (public.can_edit_meeting(meeting_id));
create policy action_items_update on public.action_items for update to authenticated
  using (public.can_edit_meeting(meeting_id)
         or (public.is_editor() and assignee_id = public.current_member_id()))
  with check (public.is_editor());
create policy action_items_delete on public.action_items for delete to authenticated
  using (public.can_edit_meeting(meeting_id));

-- -----------------------------------------------------------------------------
-- Resources：documents / faqs / software_tools 為協作型 wiki，所有 member 可編輯；
-- 刪除限 Admin 或建立者。pipelines 限建立者／維護者編輯。
-- -----------------------------------------------------------------------------
create policy documents_insert on public.documents for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy documents_update on public.documents for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy documents_delete on public.documents for delete to authenticated
  using (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));

create policy faqs_insert on public.faqs for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy faqs_update on public.faqs for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy faqs_delete on public.faqs for delete to authenticated
  using (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));

create policy software_tools_insert on public.software_tools for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy software_tools_update on public.software_tools for update to authenticated
  using (public.is_editor()) with check (public.is_editor());
create policy software_tools_delete on public.software_tools for delete to authenticated
  using (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));

create policy pipelines_insert on public.pipelines for insert to authenticated
  with check (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));
create policy pipelines_update on public.pipelines for update to authenticated
  using (public.can_edit_pipeline(id)) with check (public.is_editor());
create policy pipelines_delete on public.pipelines for delete to authenticated
  using (public.is_admin() or (public.is_editor() and created_by = public.current_member_id()));

create policy pipeline_steps_write on public.pipeline_steps for all to authenticated
  using (public.can_edit_pipeline(pipeline_id)) with check (public.can_edit_pipeline(pipeline_id));

-- -----------------------------------------------------------------------------
-- attachments / page_settings / activity_log
-- -----------------------------------------------------------------------------
create policy attachments_insert on public.attachments for insert to authenticated
  with check (public.can_edit_entity(entity_type, entity_id)
              and uploaded_by = public.current_member_id());
create policy attachments_delete on public.attachments for delete to authenticated
  using (public.is_admin()
         or (public.is_editor() and uploaded_by = public.current_member_id()));

create policy page_settings_update on public.page_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- activity_log 只能由 trigger（security definer）寫入，使用者無 insert/update/delete policy

-- -----------------------------------------------------------------------------
-- 函式執行權限
-- -----------------------------------------------------------------------------
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
