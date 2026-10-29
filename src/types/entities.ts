import type { AppRole, MemberPosition, ProjectStatus, PublicationStage, TaskPriority, TaskStatus } from "./db";
import type { MeetingType } from "./dashboard";

// 對應 supabase/migrations/20261029000008_projects_tasks_publications_api.sql 的 JSON 結構

export type PublicationType = "journal" | "conference" | "preprint" | "thesis";
export type MemberBrief = { id: string; name: string; avatar_url: string | null };
export type Ref = { id: string; title: string; emoji?: string };

export type Project = {
  id: string;
  title: string;
  emoji: string;
  description: string | null;
  status: ProjectStatus;
  start_date: string | null;
  due_date: string | null;
  progress: number;
  tags: string[];
  color: string | null;
  updated_at: string;
  owner: MemberBrief | null;
  members: (MemberBrief & { role: string | null })[];
  task_total: number;
  task_done: number;
  task_overdue: number;
  publication_count: number;
  editable: boolean;
  deletable: boolean;
};

export type Attachment = {
  id: string;
  kind: "slides" | "file";
  title: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string;
  preview_path: string | null;
  preview_error: string | null;
  created_at: string;
  uploaded_by: MemberBrief | null;
  deletable: boolean;
};

export type ProjectDetail = Project & {
  content: string;
  content_version: number;
  files: Attachment[];
  tasks: Task[];
  publications: Publication[];
  meetings: { id: string; title: string; emoji: string; type: MeetingType; starts_at: string }[];
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  position: number;
  completed_at: string | null;
  created_at: string;
  overdue: boolean | null;
  project: Ref | null;
  publication: Ref | null;
  meeting: Ref | null;
  assignees: MemberBrief[];
  created_by: MemberBrief | null;
  editable: boolean;
  deletable: boolean;
};

export type PublicationAuthor = {
  member_id: string | null;
  name: string;
  display_name: string | null;
  is_first_author: boolean;
  is_corresponding: boolean;
};

export type Publication = {
  id: string;
  title: string;
  emoji: string;
  type: PublicationType;
  stage: PublicationStage;
  venue: string | null;
  submitted_at: string | null;
  deadline: string | null;
  accepted_at: string | null;
  published_at: string | null;
  doi: string | null;
  url: string | null;
  abstract: string | null;
  notes: string | null;
  updated_at: string;
  project: Ref | null;
  authors: PublicationAuthor[];
  editable: boolean;
  deletable: boolean;
};

export type YearStat = {
  year: number;
  journal: number;
  conference: number;
  preprint: number;
  thesis: number;
  submitted: number;
};

export type FormOptions = {
  members: (MemberBrief & { position: MemberPosition; is_alumni: boolean })[];
  projects: (Ref & { status: ProjectStatus })[];
  publications: (Ref & { stage: PublicationStage })[];
  can_create: boolean;
};

export type MemberProfile = {
  id: string;
  name: string;
  name_en: string | null;
  email: string | null;
  avatar_url: string | null;
  position: MemberPosition;
  app_role: AppRole;
  is_alumni: boolean;
  is_system_admin: boolean;
  research_interests: string[];
  bio: string | null;
  join_year: number | null;
  left_year: number | null;
  current_affiliation: string | null;
  links: { label: string; url: string }[];
  sort_order: number;
  has_account: boolean;
  projects: (Ref & { emoji: string; status: ProjectStatus; is_owner: boolean })[];
  editable: boolean;
  /** 目前使用者能否變更此成員的權限、職稱等（管理員只有系統管理員能變更） */
  manageable: boolean;
  is_me: boolean;
};

export type MemberDetail = MemberProfile & { publications: Publication[]; tasks: Task[] };

export type InviteCode = {
  id: string;
  code_hint: string;
  note: string | null;
  app_role: AppRole;
  position: MemberPosition | null;
  email: string | null;
  member: MemberBrief | null;
  max_uses: number;
  used_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  created_by: MemberBrief | null;
  status: "active" | "used" | "expired" | "revoked";
  redeemed_by: string[];
};

// 對應 supabase/migrations/20261029000013_resources_api.sql
type Permission = { editable: boolean; deletable: boolean };

export type DocumentItem = Permission & {
  id: string;
  kind: "orientation" | "wiki";
  parent_id: string | null;
  slug: string;
  title: string;
  emoji: string;
  sort_order: number;
  updated_at: string;
  updated_by: MemberBrief | null;
};
export type DocumentDetail = DocumentItem & { content: string; content_version: number };

export type Faq = Permission & {
  id: string;
  question: string;
  answer: string;
  category: string;
  tags: string[];
  sort_order: number;
  updated_at: string;
};

export type SoftwareTool = Permission & {
  id: string;
  name: string;
  emoji: string;
  category: string;
  purpose: string | null;
  access_info: string | null;
  install_guide: string | null;
  url: string | null;
  docs_url: string | null;
  contact: MemberBrief | null;
  updated_at: string;
};

export type PipelineStep = { id?: string; title: string; description: string | null; code: string | null; code_language: string | null };
export type Pipeline = Permission & {
  id: string;
  name: string;
  emoji: string;
  description: string | null;
  inputs: string | null;
  outputs: string | null;
  version: string;
  repo_url: string | null;
  tags: string[];
  maintainer: MemberBrief | null;
  project: (Ref & { emoji: string }) | null;
  step_count: number;
  updated_at: string;
};
export type PipelineDetail = Pipeline & { steps: PipelineStep[] };

export type MeetingAttendee = MemberBrief & { is_presenter: boolean };
export type Meeting = Permission & {
  id: string;
  title: string;
  emoji: string;
  type: MeetingType;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  attendees: MeetingAttendee[];
  projects: (Ref & { emoji: string })[];
  action_total: number;
  action_open: number;
  has_notes: boolean;
};
export type ActionItem = {
  id: string;
  content: string;
  due_date: string | null;
  is_done: boolean;
  position: number;
  assignee: MemberBrief | null;
  task: { id: string; title: string; status: TaskStatus } | null;
  overdue: boolean;
  editable: boolean;
};
export type MeetingDetail = Meeting & {
  summary: string;
  summary_version: number;
  decisions: string | null;
  action_items: ActionItem[];
};
