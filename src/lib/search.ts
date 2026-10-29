export type SearchType =
  | "member"
  | "project"
  | "task"
  | "publication"
  | "meeting"
  | "document"
  | "faq"
  | "software_tool"
  | "pipeline";

export type SearchHit = {
  entity_type: SearchType;
  id: string;
  title: string;
  subtitle: string | null;
  emoji: string | null;
  score: number;
  link_key: string | null;
};

/** 搜尋結果分組順序 */
export const SEARCH_ORDER: SearchType[] = ["member", "project", "task", "publication", "meeting", "document", "faq", "software_tool", "pipeline"];

/** 各類資料的連結；任務、論文沒有獨立頁面，開啟列表並直接打開該筆 */
export function hrefFor(hit: Pick<SearchHit, "entity_type" | "id" | "title" | "link_key">): string | null {
  const q = encodeURIComponent(hit.title);
  switch (hit.entity_type) {
    case "member":
      return `/members/${hit.id}`;
    case "project":
      return `/projects/${hit.id}`;
    case "task":
      return `/tasks?view=list&q=${q}&task=${hit.id}`;
    case "publication":
      return `/publications?view=table&q=${q}&pub=${hit.id}`;
    case "meeting":
      return `/meetings/${hit.id}`;
    case "document":
      return hit.link_key ? `/orientation/${hit.link_key}` : null;
    case "faq":
      return `/faq?q=${q}#faq-${hit.id}`;
    case "software_tool":
      return `/software/${hit.id}`;
    case "pipeline":
      return `/pipelines/${hit.id}`;
    default:
      return null;
  }
}

export function groupHits(hits: SearchHit[]) {
  return SEARCH_ORDER.map((type) => ({ type, hits: hits.filter((h) => h.entity_type === type) })).filter((g) => g.hits.length);
}
