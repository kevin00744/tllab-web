"use client";

import { saveDocumentContent } from "@/app/(app)/orientation/actions";
import { InlineDoc } from "@/components/editor/inline-doc";
import { useI18n } from "@/lib/i18n/client";

export function DocumentDoc({ id, content, version, editable }: { id: string; content: string; version: number; editable: boolean }) {
  const { t } = useI18n();
  return (
    <InlineDoc
      content={content}
      version={version}
      editable={editable}
      save={(body, v) => saveDocumentContent(id, body, v)}
      emptyText={t.orientationPage.emptyDoc}
      testId="document-doc"
      anchors
    />
  );
}
