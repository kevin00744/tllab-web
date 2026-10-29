import type { Dictionary } from "@/lib/i18n";
import type { ProjectStatus, PublicationStage, TaskPriority, TaskStatus, AppRole } from "@/types/db";

// 全站狀態色一致：灰＝未開始、藍＝進行、紫＝等待他人、琥珀＝注意、綠＝完成、紅＝緊急
export type Tone = "gray" | "blue" | "purple" | "amber" | "green" | "red";

export const projectStatusTone: Record<ProjectStatus, Tone> = {
  planning: "gray",
  active: "blue",
  paused: "amber",
  completed: "green",
};

export const taskStatusTone: Record<TaskStatus, Tone> = {
  todo: "gray",
  in_progress: "blue",
  in_review: "purple",
  done: "green",
};

export const priorityTone: Record<TaskPriority, Tone> = { high: "red", medium: "amber", low: "gray" };

export const publicationStageTone: Record<PublicationStage, Tone> = {
  idea: "gray",
  drafting: "blue",
  submitted: "purple",
  revision: "amber",
  accepted: "green",
  published: "green",
};

export const roleTone: Record<AppRole, Tone> = { admin: "purple", member: "blue", viewer: "gray" };

/** 系統管理員旗標只在 app_role 為 admin（且非校友）時有效，與資料庫 is_system_admin() 相同 */
export function isSystemAdmin(m: { app_role: AppRole; is_system_admin?: boolean; is_alumni?: boolean } | null) {
  return !!m?.is_system_admin && m.app_role === "admin" && !m.is_alumni;
}

/** 權限名稱；系統管理員另外標示 */
export function roleLabel(t: Dictionary, m: { app_role: AppRole; is_system_admin?: boolean; is_alumni?: boolean }) {
  return isSystemAdmin(m) ? t.roles.systemAdmin : t.roles[m.app_role];
}

export function statusLabel(t: Dictionary, kind: keyof Dictionary["status"], value: string) {
  return (t.status[kind] as Record<string, string>)[value] ?? value;
}
