import type { ManageEntity } from "@/app/(app)/manage-actions";
import { getCurrentMember } from "@/lib/auth";
import { listDocuments, listFaqs, listMeetings, listPipelines, listProjects, listPublications, listSoftware, listTasks } from "@/lib/data";
import { formatDateTime } from "@/lib/date";
import { iconText } from "@/lib/icon";
import { getI18n } from "@/lib/i18n/server";
import { getPageMeta } from "@/lib/pages";
import type { PageKey } from "@/lib/nav";
import { statusLabel } from "@/lib/status";
import { buildTree, flattenTree, type DocNode } from "@/lib/tree";
import { AdminManager, type ManageItem, type ManageTarget } from "./admin-manager";

const PAGE: Record<ManageEntity, PageKey> = {
  project: "projects",
  task: "tasks",
  publication: "publications",
  document: "orientation",
  faq: "faq",
  software: "software",
  pipeline: "pipelines",
  meeting: "meetings",
};

const PROJECT_STATUSES = ["planning", "active", "paused", "completed"] as const;
const STAGES = ["idea", "drafting", "submitted", "revision", "accepted", "published"] as const;
const MEETING_TYPES = ["lab_meeting", "one_on_one", "journal_club"] as const;

function depthOf(node: DocNode, byId: Map<string, DocNode>) {
  let depth = 0;
  for (let p = node.parent_id ? byId.get(node.parent_id) : undefined; p; p = p.parent_id ? byId.get(p.parent_id) : undefined) depth++;
  return depth;
}

/** 頁首的「管理」按鈕：只有 Admin 看得到；資料一律取完整清單（不受頁面篩選影響） */
export async function ManageButton({ entity }: { entity: ManageEntity }) {
  const me = await getCurrentMember();
  if (me?.app_role !== "admin") return null;
  const { locale, t } = await getI18n();
  const page = await getPageMeta(PAGE[entity], locale, t);
  const projectTargets = async (): Promise<ManageTarget[]> => [
    { value: "", label: t.manage.noProject },
    ...(await listProjects()).map((p) => ({ value: p.id, label: `${iconText(p.emoji)} ${p.title}`.trim() })),
  ];

  let items: ManageItem[] = [];
  let targets: ManageTarget[] = [];
  let defaultIcon: string | undefined;
  let allowNewTarget = false;

  switch (entity) {
    case "project": {
      items = (await listProjects()).map((p) => ({ id: p.id, title: p.title, icon: p.emoji, group: statusLabel(t, "project", p.status) }));
      targets = PROJECT_STATUSES.map((s) => ({ value: s, label: statusLabel(t, "project", s) }));
      defaultIcon = "📁";
      break;
    }
    case "task": {
      items = (await listTasks()).map((x) => ({ id: x.id, title: x.title, group: x.project?.title ?? t.manage.noProject }));
      targets = await projectTargets();
      break;
    }
    case "publication": {
      items = (await listPublications()).map((p) => ({ id: p.id, title: p.title, icon: p.emoji, group: statusLabel(t, "publication", p.stage) }));
      targets = STAGES.map((s) => ({ value: s, label: statusLabel(t, "publication", s) }));
      defaultIcon = "📄";
      break;
    }
    case "document": {
      const docs = await listDocuments();
      const flat = flattenTree(buildTree(docs));
      const byId = new Map(flat.map((d) => [d.id, d]));
      items = flat.map((d) => ({ id: d.id, title: d.title, icon: d.emoji, depth: depthOf(d, byId) }));
      targets = [
        { value: "", label: t.manage.top },
        ...flat.map((d) => ({ value: d.id, label: `${"　".repeat(depthOf(d, byId))}${iconText(d.emoji)} ${d.title}` })),
      ];
      defaultIcon = "📘";
      break;
    }
    case "faq": {
      const faqs = await listFaqs();
      items = faqs.map((f) => ({ id: f.id, title: f.question, group: f.category }));
      targets = [...new Set(faqs.map((f) => f.category))].map((c) => ({ value: c, label: c }));
      allowNewTarget = true;
      break;
    }
    case "software": {
      const tools = await listSoftware();
      items = tools.map((s) => ({ id: s.id, title: s.name, icon: s.emoji, group: s.category }));
      targets = [...new Set(tools.map((s) => s.category))].map((c) => ({ value: c, label: c }));
      allowNewTarget = true;
      defaultIcon = "🧰";
      break;
    }
    case "pipeline": {
      items = (await listPipelines()).map((p) => ({ id: p.id, title: p.name, icon: p.emoji, group: p.project?.title ?? t.manage.noProject }));
      targets = await projectTargets();
      defaultIcon = "🔬";
      break;
    }
    case "meeting": {
      items = (await listMeetings()).map((x) => ({
        id: x.id,
        title: x.title,
        icon: x.emoji,
        group: `${t.meetingType[x.type]} · ${formatDateTime(locale, x.starts_at, { dateStyle: "medium" })}`,
      }));
      targets = MEETING_TYPES.map((s) => ({ value: s, label: t.meetingType[s] }));
      defaultIcon = "🗓️";
      break;
    }
  }

  return (
    <AdminManager
      entity={entity}
      pageTitle={page.title}
      items={items}
      targets={targets}
      allowNewTarget={allowNewTarget}
      defaultIcon={defaultIcon}
    />
  );
}
