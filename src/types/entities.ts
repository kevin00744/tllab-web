import type { MemberPosition, ProjectStatus, PublicationStage, TaskPriority, TaskStatus } from "./db";
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
