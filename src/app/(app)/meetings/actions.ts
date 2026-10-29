"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";

export type MeetingInput = {
  id?: string;
  title: string;
  emoji: string;
  type: string;
  starts_at: string;
  ends_at: string;
  location: string;
  decisions: string;
  links: { label: string; url: string }[];
  attendees: { member_id: string; is_presenter: boolean }[];
  project_ids: string[];
};

export type ActionItemInput = {
  id?: string;
  meeting_id?: string;
  content: string;
  assignee_id?: string;
  due_date?: string;
  is_done?: boolean;
};

async function call<T>(fn: string, args: Record<string, unknown>): Promise<ActionResult<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: toActionError(error) };
  // 會議也會出現在 Dashboard、專案頁與任務
  revalidatePath("/", "layout");
  return { ok: true, data: data as T };
}

export const saveMeeting = async (input: MeetingInput) => call<string>("save_meeting", { p: input });
export const deleteMeeting = async (id: string) => call<undefined>("delete_meeting", { p_id: id });
export const saveMeetingSummary = async (id: string, content: string, version: number) =>
  call<number>("save_meeting_summary", { p_id: id, p_content: content, p_version: version });
export const saveActionItem = async (input: ActionItemInput) => call<string>("save_action_item", { p: input });
export const deleteActionItem = async (id: string) => call<undefined>("delete_action_item", { p_id: id });
export const convertActionItem = async (id: string) => call<string>("convert_action_item_to_task", { p_action_item_id: id });
