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

export function statusLabel(t: Dictionary, kind: keyof Dictionary["status"], value: string) {
  return (t.status[kind] as Record<string, string>)[value] ?? value;
}
