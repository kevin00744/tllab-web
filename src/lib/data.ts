import "server-only";
import { cache } from "react";

import type { SearchHit } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";
import type {
  BoardThread,
  ActivityEntry,
  CalendarItem,
  FormOptions,
  DocumentDetail,
  DocumentItem,
  Faq,
  InviteCode,
  Meeting,
  MeetingDetail,
  MemberDetail,
  MemberProfile,
  Project,
  ProjectDetail,
  Pipeline,
  PipelineDetail,
  Publication,
  SoftwareTool,
  Task,
  YearStat,
} from "@/types/entities";
import { getUserId } from "@/lib/auth";

// 讀取資料：一律呼叫資料庫函式（security invoker，權限由 RLS 決定）
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`${fn} failed`, error);
    throw new Error(`${fn}: ${error.message}`);
  }
  return data as T;
}

type Filter = Record<string, string | number | boolean | undefined>;
const clean = (f: Filter) => Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== ""));

export const getFormOptions = cache(() => rpc<FormOptions>("form_options"));
export const listProjects = (filter: Filter = {}) => rpc<Project[]>("list_projects", { p_filter: clean(filter) });
export const getProject = (id: string) => rpc<ProjectDetail | null>("get_project", { p_id: id });
export const listTasks = (filter: Filter = {}) => rpc<Task[]>("list_tasks", { p_filter: clean(filter) });
export const listPublications = (filter: Filter = {}) =>
  rpc<Publication[]>("list_publications", { p_filter: clean(filter) });
export const getPublicationStats = () => rpc<YearStat[]>("publication_year_stats");
export const listMembers = (filter: Filter = {}) => rpc<MemberProfile[]>("list_members", { p_filter: clean(filter) });
export const getMember = (id: string) => rpc<MemberDetail | null>("get_member", { p_id: id });
export const listActivity = (filter: Record<string, string | number | undefined> = {}) =>
  rpc<ActivityEntry[]>("list_activity", { p_filter: Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== "")) });
export const listPageSettings = () => rpc<{ key: string; emoji: string; title: string; title_en: string }[]>("list_page_settings");
export const listCalendar = (from: string, to: string, filter: { kinds?: string[]; mine?: boolean } = {}) =>
  rpc<CalendarItem[]>("list_calendar", { p_from: from, p_to: to, p_filter: filter });
export const searchAll = (q: string, max = 30) => rpc<SearchHit[]>("search_all", { q, max_results: max });
export const listInviteCodes = () => rpc<InviteCode[]>("list_invite_codes");
export const listDocuments = () => rpc<DocumentItem[]>("list_documents");
export const getDocument = (slug: string) => rpc<DocumentDetail | null>("get_document", { p_slug: slug });
export const listFaqs = (filter: Filter = {}) => rpc<Faq[]>("list_faqs", { p_filter: clean(filter) });
export const getFaqCategories = () => rpc<{ category: string; count: number }[]>("faq_categories");
export const listSoftware = (filter: Filter = {}) => rpc<SoftwareTool[]>("list_software", { p_filter: clean(filter) });
export const getSoftware = (id: string) => rpc<SoftwareTool | null>("get_software", { p_id: id });
export const listPipelines = (filter: Filter = {}) => rpc<Pipeline[]>("list_pipelines", { p_filter: clean(filter) });
export const getPipeline = (id: string) => rpc<PipelineDetail | null>("get_pipeline", { p_id: id });
export type MySettings = { hide_done_tasks?: boolean; hide_done_projects?: boolean };
/** 自己的顯示偏好；訪客沒有設定 */
export const getMySettings = cache(async (): Promise<MySettings> => ((await getUserId()) ? ((await rpc<MySettings>("get_my_settings")) ?? {}) : {}));
export const listBoardThreads = (filter: Filter = {}) => rpc<BoardThread[]>("list_board", { p_filter: clean(filter) });
/** 留言板的 @ 成員與 # 專案選項 */
export const boardOptions = (options: FormOptions) => ({
  members: options.members.map(({ id, name, alt_name, avatar_url }) => ({ id, name, alt_name, avatar_url })),
  projects: options.projects.map((p) => ({ id: p.id, title: p.title, emoji: p.emoji ?? "📁" })),
});
export const listMeetings = (filter: Filter = {}) => rpc<Meeting[]>("list_meetings", { p_filter: clean(filter) });
export const getMeeting = (id: string) => rpc<MeetingDetail | null>("get_meeting", { p_id: id });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
