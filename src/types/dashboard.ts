import type { CalendarItem } from "./entities";
import type { ProjectStatus, PublicationStage, TaskPriority, TaskStatus } from "./db";

// 對應 public.get_dashboard() 的回傳結構（supabase/migrations/20261029000007_dashboard.sql）
export type MeetingType = "lab_meeting" | "one_on_one" | "journal_club";

export type DashboardData = {
  today: string;
  kpis: {
    active_projects: number;
    tasks_due_this_week: number;
    tasks_overdue: number;
    publications_published_this_year: number;
    publications_under_submission: number;
  };
  my_open: number;
  my_overdue: number;
  my_tasks: {
    id: string;
    title: string;
    status: TaskStatus;
    priority: TaskPriority;
    due_date: string | null;
    overdue: boolean | null;
    project: { id: string; title: string; emoji: string } | null;
  }[];
  projects: {
    id: string;
    title: string;
    emoji: string;
    status: ProjectStatus;
    progress: number;
    task_progress: number | null;
    task_total: number;
    task_done: number;
    task_overdue: number;
    due_date: string | null;
    owner_name: string | null;
    /** 自己是負責人或參與成員 */
    mine: boolean;
  }[];
  publication_stages: {
    stage: PublicationStage;
    total: number;
    items: { id: string; title: string; venue: string | null }[];
  }[];
  recent_meetings: {
    id: string;
    title: string;
    emoji: string;
    type: MeetingType;
    starts_at: string;
    location: string | null;
    summary: string | null;
    attendee_count: number;
    presenters: string[];
  }[];
  next_meeting: {
    id: string;
    title: string;
    emoji: string;
    type: MeetingType;
    starts_at: string;
    ends_at: string | null;
    location: string | null;
  } | null;
  deadlines: {
    kind: "task" | "publication";
    id: string;
    title: string;
    emoji: string;
    due_date: string;
    status: string;
    priority: TaskPriority | null;
    mine: boolean;
    project_title: string | null;
  }[];
  /** 未來 7 天的行事曆活動與會議 */
  upcoming: CalendarItem[];
  /** member_preferences.dashboard（原始值，見 normalizePrefs） */
  prefs: unknown;
};
