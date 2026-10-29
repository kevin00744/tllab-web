-- =============================================================================
-- TL Lab Hub — 01 核心資料表
-- -----------------------------------------------------------------------------
-- 區塊對照 Notion Team space：
--   About the team : members / projects / tasks / publications
--   Resources      : documents(Orientation Guide) / faqs / software_tools /
--                    pipelines / meetings(Meeting Summary)
--   共通            : attachments / activity_log / page_settings
-- =============================================================================

-- Supabase 預設 search_path 含 extensions schema
create extension if not exists pg_trgm with schema extensions;

-- 實驗室在台灣：「今天」一律以 Asia/Taipei 計算（資料庫本身時區為 UTC）
create or replace function public.lab_today()
returns date
language sql stable
as $$
  select (now() at time zone 'Asia/Taipei')::date;
$$;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.app_role          as enum ('admin', 'member', 'viewer');
create type public.member_position   as enum ('pi', 'postdoc', 'phd', 'master', 'undergrad', 'staff');
create type public.project_status    as enum ('planning', 'active', 'paused', 'completed');
create type public.task_priority     as enum ('high', 'medium', 'low');
create type public.task_status       as enum ('todo', 'in_progress', 'in_review', 'done');
create type public.publication_type  as enum ('journal', 'conference', 'preprint', 'thesis');
create type public.publication_stage as enum ('idea', 'drafting', 'submitted', 'revision', 'accepted', 'published');
create type public.meeting_type      as enum ('lab_meeting', 'one_on_one', 'journal_club');
create type public.document_kind     as enum ('orientation', 'wiki');

-- -----------------------------------------------------------------------------
-- 共用 trigger：updated_at
-- -----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- members：實驗室成員（可先建立、成員首次登入時以 email 自動綁定 auth.users）
-- -----------------------------------------------------------------------------
create table public.members (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid unique references auth.users (id) on delete set null,
  name                text not null,                       -- 顯示名稱（中文）
  name_en             text,                                -- 英文名
  email               text,
  avatar_url          text,
  position            public.member_position not null default 'undergrad',
  app_role            public.app_role not null default 'viewer',
  is_alumni           boolean not null default false,      -- 校友另外分區
  research_interests  text[] not null default '{}',
  bio                 text,
  join_year           smallint check (join_year between 1990 and 2100),
  left_year           smallint check (left_year between 1990 and 2100),
  current_affiliation text,                                -- 校友現職
  links               jsonb not null default '[]'::jsonb,  -- [{label, url}]
  sort_order          integer not null default 0,
  notion_id           text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint members_left_after_join check (left_year is null or join_year is null or left_year >= join_year)
);

create unique index members_email_key on public.members (lower(email));
create index members_position_idx on public.members (is_alumni, position, sort_order);

comment on column public.members.position is 'PI / Postdoc / PhD / Master / 專題生 / 研究助理；校友以 is_alumni 標記並保留原職稱';
comment on column public.members.app_role is '系統權限：admin（PI/管理者）、member、viewer（唯讀，例如校友或訪客）';

create trigger members_touch before update on public.members
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- 身分輔助函式（RLS 與欄位預設值都會用到）
-- security definer：避免在 members 的 RLS policy 中遞迴查詢 members
-- -----------------------------------------------------------------------------
create or replace function public.current_member_id()
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select m.id from public.members m where m.user_id = auth.uid();
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer
set search_path = ''
as $$
  select m.app_role from public.members m where m.user_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'admin', false);
$$;

-- admin 或 member（可新增內容）
create or replace function public.is_editor()
returns boolean
language sql stable
set search_path = ''
as $$
  select coalesce(public.current_app_role() in ('admin', 'member'), false);
$$;

-- -----------------------------------------------------------------------------
-- projects
-- -----------------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  emoji       text not null default '📁',
  description text,                                        -- Markdown
  owner_id    uuid references public.members (id) on delete set null,   -- 負責人
  status      public.project_status not null default 'planning',
  start_date  date,
  due_date    date,                                        -- 預計完成日
  progress    smallint not null default 0 check (progress between 0 and 100),
  tags        text[] not null default '{}',
  color       text,                                        -- 甘特圖顏色（可選）
  notion_id   text unique,
  created_by  uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_dates check (due_date is null or start_date is null or due_date >= start_date)
);

create index projects_status_idx on public.projects (status);
create index projects_owner_idx on public.projects (owner_id);
create index projects_tags_idx on public.projects using gin (tags);
create index projects_title_trgm on public.projects using gin (title gin_trgm_ops);

create trigger projects_touch before update on public.projects
  for each row execute function public.touch_updated_at();

-- 專案參與成員（多對多）
create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  member_id  uuid not null references public.members (id) on delete cascade,
  role       text,                                         -- 例如「影像分析」「實驗」
  added_at   timestamptz not null default now(),
  primary key (project_id, member_id)
);
create index project_members_member_idx on public.project_members (member_id);

-- -----------------------------------------------------------------------------
-- publications（Publication Tracker）
-- -----------------------------------------------------------------------------
create table public.publications (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  emoji        text not null default '📄',
  type         public.publication_type not null default 'journal',
  stage        public.publication_stage not null default 'idea',
  venue        text,                                       -- 目標期刊／會議
  project_id   uuid references public.projects (id) on delete set null,  -- 所屬專案
  submitted_at date,                                       -- 投稿日
  deadline     date,                                       -- 截止日（投稿 / 修稿 deadline）
  accepted_at  date,
  published_at date,
  doi          text,
  url          text,
  abstract     text,
  notes        text,                                       -- 備註（Markdown）
  notion_id    text unique,
  created_by   uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index publications_stage_idx on public.publications (stage);
create index publications_project_idx on public.publications (project_id);
create index publications_deadline_idx on public.publications (deadline) where deadline is not null;
create index publications_title_trgm on public.publications using gin (title gin_trgm_ops);

create trigger publications_touch before update on public.publications
  for each row execute function public.touch_updated_at();

-- 作者（有序；可連結成員，也可為外部作者）
create table public.publication_authors (
  id                uuid primary key default gen_random_uuid(),
  publication_id    uuid not null references public.publications (id) on delete cascade,
  member_id         uuid references public.members (id) on delete set null,
  display_name      text,                                  -- 外部作者姓名，或覆寫顯示名
  author_order      smallint not null,
  is_first_author   boolean not null default false,        -- 允許共同第一作者
  is_corresponding  boolean not null default false,
  constraint publication_authors_identity check (member_id is not null or display_name is not null),
  constraint publication_authors_order_key unique (publication_id, author_order) deferrable initially deferred
);
create index publication_authors_member_idx on public.publication_authors (member_id);

-- -----------------------------------------------------------------------------
-- meetings（Meeting Summary）
-- 未來時間的 meeting 即為「下次會議」
-- -----------------------------------------------------------------------------
create table public.meetings (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  emoji       text not null default '🗓️',
  type        public.meeting_type not null default 'lab_meeting',
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  location    text,
  summary     text,                                        -- 摘要（Markdown）
  decisions   text,                                        -- 決議事項（Markdown）
  notion_id   text unique,
  created_by  uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint meetings_time check (ends_at is null or ends_at >= starts_at)
);
create index meetings_starts_idx on public.meetings (starts_at desc);
create index meetings_title_trgm on public.meetings using gin (title gin_trgm_ops);

create trigger meetings_touch before update on public.meetings
  for each row execute function public.touch_updated_at();

-- 出席者／報告人
create table public.meeting_attendees (
  meeting_id   uuid not null references public.meetings (id) on delete cascade,
  member_id    uuid not null references public.members (id) on delete cascade,
  is_presenter boolean not null default false,
  primary key (meeting_id, member_id)
);
create index meeting_attendees_member_idx on public.meeting_attendees (member_id);

-- 會議 ↔ 專案（多對多）
create table public.meeting_projects (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  primary key (meeting_id, project_id)
);
create index meeting_projects_project_idx on public.meeting_projects (project_id);

-- -----------------------------------------------------------------------------
-- tasks
-- -----------------------------------------------------------------------------
create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  title          text not null,
  description    text,                                     -- Markdown
  project_id     uuid references public.projects (id) on delete set null,
  publication_id uuid references public.publications (id) on delete set null,
  meeting_id     uuid references public.meetings (id) on delete set null,  -- 來源會議
  priority       public.task_priority not null default 'medium',
  status         public.task_status not null default 'todo',
  due_date       date,
  completed_at   timestamptz,
  position       double precision not null default 0,     -- 看板內排序（拖拉）
  notion_id      text unique,
  created_by     uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index tasks_status_idx on public.tasks (status, position);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_publication_idx on public.tasks (publication_id);
create index tasks_meeting_idx on public.tasks (meeting_id);
create index tasks_due_idx on public.tasks (due_date) where status <> 'done';
create index tasks_title_trgm on public.tasks using gin (title gin_trgm_ops);

create or replace function public.tasks_set_completed_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create trigger tasks_completed before insert or update of status on public.tasks
  for each row execute function public.tasks_set_completed_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- 指派對象（多對多）
create table public.task_assignees (
  task_id     uuid not null references public.tasks (id) on delete cascade,
  member_id   uuid not null references public.members (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (task_id, member_id)
);
create index task_assignees_member_idx on public.task_assignees (member_id);

-- 會議 Action items（可一鍵轉成 Task → task_id）
create table public.action_items (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  content     text not null,
  assignee_id uuid references public.members (id) on delete set null,
  due_date    date,
  is_done     boolean not null default false,
  task_id     uuid unique references public.tasks (id) on delete set null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index action_items_meeting_idx on public.action_items (meeting_id, position);

create trigger action_items_touch before update on public.action_items
  for each row execute function public.touch_updated_at();

-- -----------------------------------------------------------------------------
-- Resources
-- -----------------------------------------------------------------------------

-- Orientation Guide 等文件頁（可巢狀，章節目錄由 Markdown 標題產生）
create table public.documents (
  id         uuid primary key default gen_random_uuid(),
  kind       public.document_kind not null default 'orientation',
  parent_id  uuid references public.documents (id) on delete cascade,
  slug       text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title      text not null,
  emoji      text not null default '📘',
  content    text not null default '',                     -- Markdown
  sort_order integer not null default 0,
  notion_id  text unique,
  created_by uuid default public.current_member_id() references public.members (id) on delete set null,
  updated_by uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index documents_tree_idx on public.documents (kind, parent_id, sort_order);
create index documents_title_trgm on public.documents using gin (title gin_trgm_ops);

create trigger documents_touch before update on public.documents
  for each row execute function public.touch_updated_at();

create table public.faqs (
  id         uuid primary key default gen_random_uuid(),
  question   text not null,
  answer     text not null default '',                     -- Markdown
  category   text not null default '一般',
  tags       text[] not null default '{}',
  sort_order integer not null default 0,
  notion_id  text unique,
  created_by uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index faqs_category_idx on public.faqs (category, sort_order);
create index faqs_question_trgm on public.faqs using gin (question gin_trgm_ops);

create trigger faqs_touch before update on public.faqs
  for each row execute function public.touch_updated_at();

create table public.software_tools (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  emoji         text not null default '🧰',
  category      text not null default '其他',
  purpose       text,                                      -- 用途
  access_info   text,                                      -- 授權／帳號取得方式（Markdown）
  install_guide text,                                      -- 安裝說明（Markdown）
  url           text,
  docs_url      text,
  contact_id    uuid references public.members (id) on delete set null,  -- 負責窗口
  notion_id     text unique,
  created_by    uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index software_tools_category_idx on public.software_tools (category);
create index software_tools_name_trgm on public.software_tools using gin (name gin_trgm_ops);

create trigger software_tools_touch before update on public.software_tools
  for each row execute function public.touch_updated_at();

create table public.pipelines (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  emoji         text not null default '🔬',
  description   text,                                      -- Markdown
  inputs        text,                                      -- 輸入說明（Markdown）
  outputs       text,                                      -- 輸出說明（Markdown）
  version       text not null default '1.0.0',
  maintainer_id uuid references public.members (id) on delete set null,
  project_id    uuid references public.projects (id) on delete set null,
  repo_url      text,
  tags          text[] not null default '{}',
  notion_id     text unique,
  created_by    uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index pipelines_maintainer_idx on public.pipelines (maintainer_id);
create index pipelines_name_trgm on public.pipelines using gin (name gin_trgm_ops);

create trigger pipelines_touch before update on public.pipelines
  for each row execute function public.touch_updated_at();

create table public.pipeline_steps (
  id            uuid primary key default gen_random_uuid(),
  pipeline_id   uuid not null references public.pipelines (id) on delete cascade,
  step_order    smallint not null,
  title         text not null,
  description   text,                                      -- Markdown
  code          text,
  code_language text,                                      -- 語法高亮用，例如 python / bash / r
  constraint pipeline_steps_order_key unique (pipeline_id, step_order) deferrable initially deferred
);

-- -----------------------------------------------------------------------------
-- 共通：附件、頁面設定
-- -----------------------------------------------------------------------------

-- 附件（多型關聯；實體檔案存在 Supabase Storage 的 attachments bucket）
create table public.attachments (
  id           uuid primary key default gen_random_uuid(),
  entity_type  text not null check (entity_type in (
                 'project', 'task', 'publication', 'meeting',
                 'document', 'faq', 'software_tool', 'pipeline', 'member')),
  entity_id    uuid not null,
  bucket       text not null default 'attachments',
  storage_path text not null,
  file_name    text not null,
  mime_type    text,
  size_bytes   bigint check (size_bytes >= 0),
  uploaded_by  uuid default public.current_member_id() references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (bucket, storage_path)
);
create index attachments_entity_idx on public.attachments (entity_type, entity_id);

-- 側邊欄各模組頁的 emoji／標題（每個頁面可設定 emoji 圖示）
create table public.page_settings (
  key         text primary key,                            -- 'dashboard', 'projects', ...
  emoji       text not null,
  title       text not null,
  title_en    text not null,
  description text,
  updated_at  timestamptz not null default now()
);

create trigger page_settings_touch before update on public.page_settings
  for each row execute function public.touch_updated_at();

insert into public.page_settings (key, emoji, title, title_en) values
  ('dashboard',      '🏠', 'Dashboard',         'Dashboard'),
  ('members',        '👥', '成員',              'Team Members'),
  ('projects',       '🧪', '專案',              'Projects'),
  ('tasks',          '✅', '任務',              'Tasks'),
  ('publications',   '📚', '論文追蹤',          'Publication Tracker'),
  ('orientation',    '🧭', '新生入門',          'Orientation Guide'),
  ('faq',            '❓', '常見問題',          'FAQ'),
  ('software',       '🧰', '軟體與工具',        'Software and Tools'),
  ('pipelines',      '🔬', '分析流程',          'Pipelines'),
  ('meetings',       '🗓️', '會議紀錄',          'Meeting Summary');

-- -----------------------------------------------------------------------------
-- 活動紀錄（由 03 migration 的 trigger 寫入）
-- -----------------------------------------------------------------------------
create table public.activity_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.members (id) on delete set null,
  action       text not null check (action in ('insert', 'update', 'delete')),
  entity_type  text not null,
  entity_id    uuid not null,
  entity_title text,
  changes      jsonb,                                      -- {欄位: {"old": ..., "new": ...}}
  created_at   timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id, created_at desc);
create index activity_log_actor_idx on public.activity_log (actor_id, created_at desc);
