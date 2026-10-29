import "server-only";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type {
  FormOptions,
  InviteCode,
  MemberDetail,
  MemberProfile,
  Project,
  ProjectDetail,
  Publication,
  Task,
  YearStat,
} from "@/types/entities";

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

type Filter = Record<string, string | boolean | undefined>;
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
export const listInviteCodes = () => rpc<InviteCode[]>("list_invite_codes");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);
