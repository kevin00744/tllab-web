"use client";

import { saveProjectContent } from "@/app/(app)/projects/actions";
import { InlineDoc } from "@/components/editor/inline-doc";

export function ProjectDoc({
  projectId,
  content,
  version,
  editable,
}: {
  projectId: string;
  content: string;
  version: number;
  editable: boolean;
}) {
  return (
    <InlineDoc
      content={content}
      version={version}
      editable={editable}
      save={(body, v) => saveProjectContent(projectId, body, v)}
      testId="project-doc"
    />
  );
}
