"use server";

import { revalidatePath } from "next/cache";

import { toActionError, type ActionResult } from "@/lib/actions";
import { createClient } from "@/lib/supabase/server";
import type { PipelineStep } from "@/types/entities";

export type PipelineInput = {
  id?: string;
  name: string;
  emoji: string;
  description: string;
  inputs: string;
  outputs: string;
  version: string;
  maintainer_id: string;
  project_id: string;
  repo_url: string;
  tags: string[];
  steps: PipelineStep[];
};

export async function savePipeline(input: PipelineInput): Promise<ActionResult<string>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_pipeline", { p: input });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/pipelines", "layout");
  return { ok: true, data: data as string };
}

export async function deletePipeline(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_pipeline", { p_id: id });
  if (error) return { ok: false, error: toActionError(error) };
  revalidatePath("/pipelines", "layout");
  return { ok: true, data: undefined };
}
