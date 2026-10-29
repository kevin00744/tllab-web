"use client";

import { saveMeetingSummary } from "@/app/(app)/meetings/actions";
import { InlineDoc } from "@/components/editor/inline-doc";
import { useI18n } from "@/lib/i18n/client";

export function MeetingNotes({ id, content, version, editable }: { id: string; content: string; version: number; editable: boolean }) {
  const { t } = useI18n();
  return (
    <InlineDoc
      content={content}
      version={version}
      editable={editable}
      save={(body, v) => saveMeetingSummary(id, body, v)}
      emptyText={t.meetingsPage.noNotes}
      emptyEditableText={t.meetingsPage.notesPlaceholder}
      testId="meeting-notes"
    />
  );
}
