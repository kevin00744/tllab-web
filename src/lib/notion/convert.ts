/**
 * Notion 匯出 → 匯入資料（送給資料庫函式 import_notion）
 * 欄位依名稱自動判斷（中英文），無法對應的欄位保留在內文最上方的屬性清單，不會遺失。
 */
import { normValue, parsePeople, parseRelations, type NotionDatabase, type NotionExport, type NotionPage, type NotionRow } from "./parse.ts";

export type Target = "member" | "project" | "task" | "publication" | "software" | "pipeline" | "meeting" | "document" | "skip";
export const TARGETS: Target[] = ["project", "task", "member", "publication", "meeting", "pipeline", "software", "document", "skip"];

// ---------------------------------------------------------------------------
// 欄位角色
// ---------------------------------------------------------------------------
type Field =
  | "email" | "position" | "interests"
  | "status" | "priority" | "progress" | "dates" | "start" | "due" | "people" | "owner" | "summary" | "tags" | "project"
  | "venue" | "submitted" | "published" | "doi" | "firstAuthor" | "corresponding" | "collaborators"
  | "url" | "docsUrl" | "category" | "version" | "path" | "files" | "tools" | "date" | "link" | "type" | "remark" | "notes"
  | "ignore";

// Notion 系統欄位（建立／編輯時間與人員）、子任務關聯、生日：不匯入
const IGNORE =
  /^(created?|last edited|last updated|edited)(\s+(by|time|date|at))?$|^(建立|建立時間|建立者|建立日期|上次編輯|最後編輯)|^sub-?tasks$|^parent-?task$|^tasks$|^birthday$|^生日$/i;

const RULES: Record<Exclude<Target, "skip">, [Field, RegExp][]> = {
  member: [
    ["email", /e-?mail|信箱/i],
    ["position", /^(role|position|title|職稱|身分|角色)$/i],
    ["interests", /expertise|interest|research|專長|研究/i],
    ["project", /project|專案|計畫/i],
  ],
  project: [
    ["status", /status|狀態/i],
    ["priority", /priority|優先/i],
    ["progress", /completion|progress|進度|完成度/i],
    ["dates", /^(dates?|timeline|期間|日期|時程)$/i],
    ["start", /start|開始/i],
    ["due", /due|deadline|end|截止|結束|目標/i],
    ["owner", /owner|lead|負責人|主持/i],
    ["people", /member|team|people|成員|參與|人員/i],
    ["summary", /summary|description|摘要|說明|簡介/i],
    ["tags", /tags?|標籤|類別|type/i],
  ],
  task: [
    ["status", /status|狀態/i],
    ["priority", /priority|優先/i],
    ["due", /due|deadline|截止|date|日期/i],
    ["people", /assign|person|people|owner|member|負責|成員|人員|指派/i],
    ["project", /project|專案|計畫/i],
    ["notes", /notes?|description|備註|說明|內容/i],
  ],
  publication: [
    ["status", /status|stage|狀態|階段/i],
    ["venue", /journal|venue|conference|期刊|會議/i],
    ["submitted", /submission|submitted|投稿/i],
    ["published", /publish|發表/i],
    ["doi", /doi/i],
    ["firstAuthor", /first author|第一作者/i],
    ["corresponding", /corresponding|通訊/i],
    ["collaborators", /collaborator|author|作者/i],
    ["project", /project|專案|計畫/i],
    ["notes", /notes?|citation|remark|備註/i],
  ],
  software: [
    ["url", /link|url|reference|website|網站|連結/i],
    ["docsUrl", /docs?|documentation|文件/i],
    ["people", /member|contact|owner|people|負責|窗口|人員/i],
    ["category", /related pipeline|category|分類|類別/i],
    ["version", /version|版本/i],
    ["path", /path|directory|路徑|目錄/i],
    ["files", /files?|檔案/i],
    ["summary", /purpose|description|用途|說明/i],
  ],
  pipeline: [
    ["people", /author|maintainer|owner|人員|作者|維護/i],
    ["path", /directory|path|路徑|目錄/i],
    ["tools", /tools?|工具/i],
    ["tags", /type|tags?|類型|標籤/i],
    ["version", /version|版本/i],
    ["status", /status|狀態/i],
    ["project", /project|專案|計畫/i],
    ["files", /files?|檔案/i],
    ["notes", /notes?|備註|說明/i],
  ],
  meeting: [
    ["date", /date|time|日期|時間/i],
    ["people", /attendee|participant|people|出席|與會|人員/i],
    ["link", /link|url|連結|網址/i],
    ["files", /files?|檔案/i],
    ["type", /^type$|類型/i],
    ["remark", /remark|notes?|備註|說明/i],
    ["project", /project|專案|計畫/i],
  ],
  document: [],
};

export function fieldOf(target: Target, column: string): Field | null {
  if (target === "skip") return null;
  if (IGNORE.test(column.trim())) return "ignore";
  for (const [field, re] of RULES[target]) if (re.test(column)) return field;
  return null;
}

/** 第一欄為標題；其餘欄位 → 角色 */
export function columnFields(db: NotionDatabase, target: Target) {
  return db.columns.slice(1).map((c) => ({ column: c, field: fieldOf(target, c) }));
}

// ---------------------------------------------------------------------------
// 自動判斷資料庫類型
// ---------------------------------------------------------------------------
export function guessTarget(db: NotionDatabase): Target {
  const n = db.name.toLowerCase();
  const cols = db.columns.join(" ").toLowerCase();
  if (/directory|team member|members?$|成員|人員名單/.test(n) || (/e-?mail/.test(cols) && /role|職稱/.test(cols))) return "member";
  if (/publication|paper|論文/.test(n)) return "publication";
  if (/software|tools?|軟體|工具/.test(n)) return "software";
  if (/pipeline|workflow|流程/.test(n)) return "pipeline";
  if (/meeting|會議|slides/.test(n)) return "meeting";
  if (/task|todo|任務|待辦|看板/.test(n)) return "task";
  if (/document|literature|文件|文獻/.test(n)) return "document";
  if (/project|專案|計畫/.test(n) && !/update/.test(n)) return "project";
  return "skip";
}

/** 同標題的列出現在 3 個以上資料庫：多半是 Notion 範本複製出來的內容（預設不匯入） */
export function templateRowKeys(exp: NotionExport): Set<string> {
  const count = new Map<string, number>();
  for (const db of exp.databases) for (const t of new Set(db.rows.map((r) => r.title))) count.set(t, (count.get(t) ?? 0) + 1);
  const keys = new Set<string>();
  for (const db of exp.databases) for (const r of db.rows) if ((count.get(r.title) ?? 0) >= 3) keys.add(r.key);
  return keys;
}

// ---------------------------------------------------------------------------
// 值的轉換
// ---------------------------------------------------------------------------
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n: number | string) => String(n).padStart(2, "0");

/** 「2025年8月11日 下午10:34」「August 11, 2025 10:34 PM」「2025/08/11」→ { date, time? } */
export function parseDate(value: string | undefined): { date: string; time?: string } | null {
  const v = (value ?? "").split("→")[0].trim();
  if (!v) return null;
  let m = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日(?:\s*(上午|下午|中午|晚上)?\s*(\d{1,2}):(\d{2}))?/.exec(v);
  if (m) {
    let time: string | undefined;
    if (m[5]) {
      let h = Number(m[5]);
      if ((m[4] === "下午" || m[4] === "晚上") && h < 12) h += 12;
      if (m[4] === "上午" && h === 12) h = 0;
      time = `${pad(h)}:${m[6]}`;
    }
    return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, time };
  }
  m = /([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM)?)?/i.exec(v);
  if (m && MONTHS.includes(m[1].toLowerCase())) {
    let time: string | undefined;
    if (m[4]) {
      let h = Number(m[4]);
      if (m[6]?.toUpperCase() === "PM" && h < 12) h += 12;
      if (m[6]?.toUpperCase() === "AM" && h === 12) h = 0;
      time = `${pad(h)}:${m[5]}`;
    }
    return { date: `${m[3]}-${pad(MONTHS.indexOf(m[1].toLowerCase()) + 1)}-${pad(m[2])}`, time };
  }
  m = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v);
  if (m) return { date: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, time: m[4] ? `${pad(m[4])}:${m[5]}` : undefined };
  return null;
}

export function parseDateRange(value: string | undefined) {
  const [a, b] = (value ?? "").split("→");
  return { start: parseDate(a), end: parseDate(b) };
}

const has = (v: string, re: RegExp) => re.test(v.trim().toLowerCase());

export function projectStatus(v: string) {
  if (has(v, /done|complete|finish|完成|結案/)) return "completed";
  if (has(v, /pause|hold|stop|暫停|擱置/)) return "paused";
  if (has(v, /progress|active|doing|ongoing|進行/)) return "active";
  return "planning";
}
export function taskStatus(v: string) {
  if (has(v, /done|complete|finish|完成/)) return "done";
  if (has(v, /review|審核|檢查/)) return "in_review";
  if (has(v, /progress|doing|ongoing|進行/)) return "in_progress";
  return "todo";
}
export function priority(v: string) {
  if (has(v, /high|urgent|高|緊急/)) return "high";
  if (has(v, /low|低/)) return "low";
  return v.trim() ? "medium" : "";
}
export function publicationStage(v: string) {
  if (has(v, /publish|發表|出版/)) return "published";
  if (has(v, /accept|接受/)) return "accepted";
  if (has(v, /revis|review|審稿|修改/)) return "revision";
  if (has(v, /submit|投稿/)) return "submitted";
  if (has(v, /idea|plan|構想/)) return "idea";
  return "drafting";
}
export function memberPosition(v: string) {
  if (has(v, /principal|^pi$|教授|主持/)) return "pi";
  if (has(v, /post-?doc|博士後/)) return "postdoc";
  if (has(v, /ph\.?d|博士/)) return "phd";
  if (has(v, /master|碩士/)) return "master";
  if (has(v, /undergrad|bachelor|大學|專題/)) return "undergrad";
  if (v.trim()) return "staff";
  return "";
}
export function meetingType(v: string) {
  if (has(v, /journal|paper|讀書/)) return "journal_club";
  if (has(v, /1[:-]?on[:-]?1|one[- ]on[- ]one|individual|個別/)) return "one_on_one";
  return "lab_meeting";
}

const URL_RE = /https?:\/\/[^\s)]+/g;

// ---------------------------------------------------------------------------
// Markdown 整理：Notion 專屬語法轉成一般 Markdown，內部連結改為 /notion/<id>
// ---------------------------------------------------------------------------
export function cleanMarkdown(md: string, opts: { imported?: Set<string> } = {}): string {
  let s = md.replace(/\r\n?/g, "\n");
  // <aside> 提示框 → 引用
  s = s.replace(/<aside>\s*\n?([\s\S]*?)<\/aside>/g, (_, inner: string) =>
    inner
      .trim()
      .split("\n")
      .map((l) => (l.trim() ? `> ${l}` : ">"))
      .join("\n"),
  );
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(span|div|details|summary|mark|u)[^>]*>/gi, "");
  // 只有資料庫連結的一行（內嵌資料庫）：移除，內容已另外匯入
  s = s.replace(/^\s*\[[^\]]*\]\([^)]*?[0-9a-f]{32}(?:_all)?\.csv\)\s*$/gim, "");
  // 圖片：本機檔案無法匯入，保留說明文字
  s = s.replace(/!\[([^\]]*)\]\((?!https?:)[^)]*\)/g, (_, alt: string) => `（圖片：${alt || "未匯入"}）`);
  // 連到其他 Notion 頁面或資料庫
  s = s.replace(/\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))*?([0-9a-f]{32})(?:_all)?\.(md|csv))\)/gi, (_, label: string, _p, id: string, ext: string) => {
    const text = label.replace(/\*\*/g, "").trim() || "Notion";
    if (ext.toLowerCase() === "csv") return text;
    return opts.imported && !opts.imported.has(id.toLowerCase()) ? text : `[${text}](/notion/${id.toLowerCase()})`;
  });
  return fenceTrees(s).replace(/\n{3,}/g, "\n\n").trim();
}

// 目錄樹（├── └── │）在 Notion 是一般文字行，Markdown 會併成一段：包成程式碼區塊保留排版
const TREE_LINE = /^\s*(\.|[│├└┌┬┼─|`]+[─\s-]*\S.*|│.*)$/;
function fenceTrees(md: string) {
  const lines = md.split("\n");
  const out: string[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const isTree = (l: string | undefined) => l !== undefined && /[│├└]/.test(l) && TREE_LINE.test(l);
    if (!inFence && isTree(line) && (isTree(lines[i + 1]) || isTree(lines[i - 1]) || lines[i - 1]?.trim() === ".")) {
      const block: string[] = [];
      if (out.length && out[out.length - 1].trim() === ".") block.push(out.pop()!);
      // 連續的樹狀行；中間只隔一個空行時也視為同一棵樹
      while (i < lines.length && (isTree(lines[i]) || (!lines[i].trim() && isTree(lines[i + 1])))) block.push(lines[i++]);
      i--;
      out.push("```text", ...block, "```");
    } else out.push(line);
  }
  return out.join("\n");
}

/** 無法對應到欄位的屬性 → 內文最上方的清單（不遺失資料） */
function propsList(entries: [string, string][]) {
  const lines = entries
    .map(([k, v]) => [k, normValue(v)] as const)
    .filter(([, v]) => v)
    .map(([k, v]) => `- **${k}**：${v.replace(/\n+/g, " ")}`);
  return lines.length ? lines.join("\n") : "";
}
const joinBlocks = (...parts: (string | null | undefined)[]) => parts.map((p) => p?.trim()).filter(Boolean).join("\n\n");

// ---------------------------------------------------------------------------
// 人員
// ---------------------------------------------------------------------------
/** 比對用姓名：小寫、去除空白與符號（保留中日韓文字） */
export const personKey = (name: string) => name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export type PersonRef = { key: string; name: string; count: number; sources: string[] };

export type PeopleChoice =
  | { kind: "existing"; memberId: string }
  | { kind: "row"; rowKey: string }
  | { kind: "create" }
  | { kind: "skip" };

export type Choices = {
  targets: Record<string, Target>;
  excludedRows: Set<string>;
  people: Record<string, PeopleChoice>;
  pages: Set<string>;
  faqPageId: string | null;
  mode: "skip" | "update";
};

const peopleFieldsOf = (target: Target): Field[] =>
  target === "publication" ? ["firstAuthor", "corresponding", "collaborators"] : ["people", "owner"];

/** 已選擇匯入的資料庫中出現的所有人名 */
export function collectPeople(exp: NotionExport, choices: Pick<Choices, "targets" | "excludedRows">): PersonRef[] {
  const map = new Map<string, PersonRef>();
  for (const db of exp.databases) {
    const target = choices.targets[db.id] ?? "skip";
    if (target === "skip" || target === "member") continue;
    const cols = columnFields(db, target).filter((c) => c.field && peopleFieldsOf(target).includes(c.field));
    for (const row of db.rows) {
      if (choices.excludedRows.has(row.key) || !row.title) continue;
      for (const { column } of cols) {
        for (const name of parsePeople(row.values[column])) {
          const key = personKey(name);
          if (!key) continue;
          const ref = map.get(key) ?? { key, name, count: 0, sources: [] };
          ref.count += 1;
          if (!ref.sources.includes(db.name)) ref.sources.push(db.name);
          map.set(key, ref);
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export type MemberCandidate = { id: string; name: string; name_en?: string | null; email?: string | null };
export type DirectoryEntry = { rowKey: string; name: string; email: string };

/** 目錄（成員資料庫）的列 */
export function directoryEntries(exp: NotionExport, targets: Record<string, Target>, excludedRows: Set<string>): DirectoryEntry[] {
  return exp.databases
    .filter((db) => targets[db.id] === "member")
    .flatMap((db) => {
      const emailCol = db.columns.find((c) => fieldOf("member", c) === "email");
      return db.rows.filter((r) => r.title && !excludedRows.has(r.key)).map((r) => ({ rowKey: r.key, name: r.title, email: emailCol ? r.values[emailCol] : "" }));
    });
}

/** 目錄的人預設對應：同 Email 或同名的既有成員，否則新增 */
export function suggestDirectory(entry: DirectoryEntry, existing: MemberCandidate[]): PeopleChoice {
  const email = entry.email.trim().toLowerCase();
  const byEmail = email && existing.find((m) => m.email?.toLowerCase() === email);
  if (byEmail) return { kind: "existing", memberId: byEmail.id };
  const k = personKey(entry.name);
  const byName = existing.find((m) => personKey(m.name) === k || (m.name_en && personKey(m.name_en) === k));
  return byName ? { kind: "existing", memberId: byName.id } : { kind: "create" };
}

/** 自動建議：姓名相同或包含（4 字以上）、Email 帳號出現在姓名中 */
export function suggestPerson(
  ref: { key: string; name: string },
  existing: MemberCandidate[],
  directory: DirectoryEntry[],
): PeopleChoice {
  const matches = (name: string, email?: string | null) => {
    const k = personKey(name);
    if (!k) return false;
    if (k === ref.key) return true;
    if (Math.min(k.length, ref.key.length) >= 4 && (k.includes(ref.key) || ref.key.includes(k))) return true;
    const local = email ? personKey(email.split("@")[0]) : "";
    return local.length >= 4 && ref.key.includes(local);
  };
  const ex = existing.find((m) => matches(m.name, m.email) || (m.name_en ? matches(m.name_en) : false));
  if (ex) return { kind: "existing", memberId: ex.id };
  const dir = directory.find((d) => matches(d.name, d.email));
  if (dir) {
    // 目錄裡的人若已是現有成員（同 Email），直接對應
    const byEmail = dir.email && existing.find((m) => m.email && m.email.toLowerCase() === dir.email.toLowerCase());
    return byEmail ? { kind: "existing", memberId: byEmail.id } : { kind: "row", rowKey: dir.rowKey };
  }
  return { kind: "create" };
}

// ---------------------------------------------------------------------------
// 匯入資料
// ---------------------------------------------------------------------------
export type ImportPayload = {
  mode: "skip" | "update";
  members: {
    key: string;
    existing_id?: string;
    notion_id?: string;
    name: string;
    email?: string;
    position?: string;
    research_interests?: string[];
    bio?: string;
    project_notion_ids?: string[];
  }[];
  projects: {
    notion_id: string;
    title: string;
    status: string;
    progress: number | null;
    start_date: string | null;
    due_date: string | null;
    description: string;
    content: string;
    tags: string[];
    owner_key: string | null;
    member_keys: string[];
  }[];
  tasks: {
    notion_id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    due_date: string | null;
    project_notion_id: string | null;
    assignee_keys: string[];
  }[];
  publications: {
    notion_id: string;
    title: string;
    stage: string;
    venue: string;
    doi: string;
    submitted_at: string | null;
    published_at: string | null;
    notes: string;
    project_notion_id: string | null;
    authors: { key: string | null; name: string; is_first: boolean; is_corresponding: boolean }[];
  }[];
  software: {
    notion_id: string;
    name: string;
    category: string;
    purpose: string;
    access_info: string;
    install_guide: string;
    url: string;
    docs_url: string;
    contact_key: string | null;
  }[];
  pipelines: {
    notion_id: string;
    name: string;
    description: string;
    version: string;
    tags: string[];
    maintainer_key: string | null;
    project_notion_id: string | null;
  }[];
  meetings: {
    notion_id: string;
    title: string;
    type: string;
    starts_at: string;
    summary: string;
    links: { label: string; url: string }[];
    attendee_keys: string[];
    project_notion_ids: string[];
  }[];
  documents: { notion_id: string; title: string; content: string; parent_notion_id: string | null }[];
  faqs: { notion_id: string; question: string; answer: string; category: string }[];
};

export const ROOT_DOC = "notion-import-root";

/** FAQ 頁：最上層清單項目為問題，縮排內容為回答 */
export function parseFaqPage(page: NotionPage, imported?: Set<string>) {
  const items: { question: string; answer: string[] }[] = [];
  let extra: string[] = [];
  for (const line of page.fullBody.split("\n")) {
    const top = /^[-*]\s+(.+)$/.exec(line);
    if (top) {
      items.push({ question: top[1].trim(), answer: [] });
    } else if (items.length && (/^\s{2,}\S/.test(line) || !line.trim())) {
      items[items.length - 1].answer.push(line.replace(/^\s{4}|^\t/, ""));
    } else if (line.trim()) {
      // 不屬於問題的內容：接在最後一題後面，或放到「其他」
      if (items.length) items[items.length - 1].answer.push(line);
      else extra.push(line);
    }
  }
  const faqs = items.map((it, i) => ({
    notion_id: `${page.id}-${i + 1}`,
    question: cleanMarkdown(it.question, { imported }),
    answer: cleanMarkdown(it.answer.join("\n").trim(), { imported }),
    category: "Notion",
  }));
  if (extra.length) {
    faqs.push({ notion_id: `${page.id}-0`, question: page.title, answer: cleanMarkdown(extra.join("\n"), { imported }), category: "Notion" });
    extra = [];
  }
  return faqs;
}

/** 頁面中連到的子頁面（不屬於任何資料庫的頁面），遞迴 */
export function linkedStandalonePages(exp: NotionExport, from: string[], limit = 200) {
  const seen = new Set<string>();
  const queue = [...from];
  while (queue.length && seen.size < limit) {
    const id = queue.shift()!;
    const page = exp.pages.get(id);
    if (!page) continue;
    for (const child of page.linkedPages) {
      if (seen.has(child) || exp.rowPageIds.has(child) || !exp.pages.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return seen;
}

export function buildPayload(
  exp: NotionExport,
  choices: Choices,
  existingMembers: MemberCandidate[],
): ImportPayload {
  const payload: ImportPayload = {
    mode: choices.mode,
    members: [],
    projects: [],
    tasks: [],
    publications: [],
    software: [],
    pipelines: [],
    meetings: [],
    documents: [],
    faqs: [],
  };
  const rowsOf = (target: Target) =>
    exp.databases
      .filter((db) => (choices.targets[db.id] ?? "skip") === target)
      .flatMap((db) => db.rows.filter((r) => r.title && !choices.excludedRows.has(r.key)).map((r) => ({ db, row: r })));

  // 同一頁面出現在多個資料庫檢視時只匯入一次（以欄位較多者為主，補上缺少的值）
  const dedupe = (items: { db: NotionDatabase; row: NotionRow }[]) => {
    const byId = new Map<string, { db: NotionDatabase; row: NotionRow }>();
    const out: { db: NotionDatabase; row: NotionRow }[] = [];
    for (const it of [...items].sort((a, b) => b.db.columns.length - a.db.columns.length)) {
      const id = it.row.pageId;
      if (!id) {
        out.push(it);
        continue;
      }
      const prev = byId.get(id);
      if (!prev) {
        byId.set(id, it);
        out.push(it);
      } else {
        for (const [k, v] of Object.entries(it.row.values)) if (v && !prev.row.values[k]) prev.row.values[k] = v;
        // 內嵌在專案頁的檢視：記下所屬專案
        if (!prev.db.parentPageId && it.db.parentPageId) (prev as { extraParent?: string }).extraParent = it.db.parentPageId;
      }
    }
    return out as ({ db: NotionDatabase; row: NotionRow; extraParent?: string })[];
  };
  const notionId = (it: { db: NotionDatabase; row: NotionRow }) => it.row.pageId ?? `${it.row.key}`;
  const pageOf = (it: { row: NotionRow }) => (it.row.pageId ? exp.pages.get(it.row.pageId) : undefined);

  // 這次會匯入的頁面 id（內部連結只改寫這些，其餘保留文字）
  const imported = new Set<string>();
  for (const t of TARGETS) if (t !== "skip") for (const it of rowsOf(t)) if (it.row.pageId) imported.add(it.row.pageId);
  for (const id of choices.pages) imported.add(id);
  const md = (s: string | undefined) => cleanMarkdown(s ?? "", { imported });

  // ---- 人員
  const projectPageIds = new Set(rowsOf("project").map((it) => it.row.pageId).filter(Boolean) as string[]);
  const keyFor = new Map<string, string | null>(); // 人名 key → 匯入 member key（null = 略過）
  const directoryRows = dedupe(rowsOf("member"));
  const rowMemberKey = (rowKey: string) => `row:${rowKey}`;
  for (const it of directoryRows) {
    // 目錄中的人：可對應到既有成員、新增、或略過（choices.people 以 row:<列鍵> 為 key）
    const dc = choices.people[rowMemberKey(it.row.key)];
    if (dc?.kind === "skip") continue;
    const fields = columnFields(it.db, "member");
    const get = (f: Field) => fields.filter((c) => c.field === f).map((c) => it.row.values[c.column]).find(Boolean) ?? "";
    const page = pageOf(it);
    const email = get("email").trim().toLowerCase();
    const existing =
      dc?.kind === "existing" ? existingMembers.find((m) => m.id === dc.memberId) : email ? existingMembers.find((m) => m.email?.toLowerCase() === email) : undefined;
    const other = fields.filter((c) => !c.field).map((c) => [c.column, it.row.values[c.column]] as [string, string]);
    payload.members.push({
      key: rowMemberKey(it.row.key),
      existing_id: existing?.id,
      notion_id: notionId(it),
      name: it.row.title,
      email: email || undefined,
      position: memberPosition(get("position")) || undefined,
      research_interests: parsePeople(get("interests")),
      bio: joinBlocks(propsList(other), md(page?.body.replace(/^##\s*Bio:?\s*$/im, ""))) || undefined,
      project_notion_ids: parseRelations(get("project")).map((r) => r.id).filter((id): id is string => !!id && projectPageIds.has(id)),
    });
  }
  const created = new Set<string>();
  const personToKey = (name: string): string | null => {
    const k = personKey(name);
    if (!k) return null;
    if (keyFor.has(k)) return keyFor.get(k)!;
    const choice = choices.people[k] ?? { kind: "create" };
    let key: string | null = null;
    if (choice.kind === "existing") {
      key = `member:${choice.memberId}`;
      if (!payload.members.some((m) => m.key === key)) {
        const m = existingMembers.find((x) => x.id === choice.memberId);
        payload.members.push({ key, existing_id: choice.memberId, name: m?.name ?? name });
      }
    } else if (choice.kind === "row") {
      key = rowMemberKey(choice.rowKey);
      if (!payload.members.some((m) => m.key === key)) key = null;
    } else if (choice.kind === "create") {
      key = `person:${k}`;
      if (!created.has(key)) {
        created.add(key);
        payload.members.push({ key, notion_id: key, name });
      }
    }
    keyFor.set(k, key);
    return key;
  };
  const peopleKeys = (value: string | undefined) => [...new Set(parsePeople(value).map(personToKey).filter((k): k is string => !!k))];

  /** 欄位值與其他欄位（無法對應者） */
  const fieldsOf = (it: { db: NotionDatabase; row: NotionRow }, target: Target) => {
    const fields = columnFields(it.db, target);
    const get = (f: Field) => fields.filter((c) => c.field === f).map((c) => it.row.values[c.column]).filter(Boolean).join(", ");
    const other = propsList(fields.filter((c) => !c.field).map((c) => [c.column, it.row.values[c.column]]));
    return { get, other };
  };
  /** 關聯欄位或內嵌位置 → 專案 notion id */
  const projectOf = (it: { db: NotionDatabase; row: NotionRow; extraParent?: string }, value: string) => {
    const rel = parseRelations(value).map((r) => r.id).find((id) => id && projectPageIds.has(id));
    if (rel) return rel;
    for (const p of [it.db.parentPageId, it.extraParent]) if (p && projectPageIds.has(p)) return p;
    return null;
  };

  // ---- 專案
  for (const it of dedupe(rowsOf("project"))) {
    const { get, other } = fieldsOf(it, "project");
    const range = parseDateRange(get("dates"));
    const progress = get("progress").trim();
    const pct = progress ? Math.round(Number(progress.replace("%", "")) * (progress.includes("%") || Number(progress) > 1 ? 1 : 100)) : null;
    const prio = priority(get("priority"));
    const ownerKey = parsePeople(get("owner")).map(personToKey).find(Boolean) ?? null;
    payload.projects.push({
      notion_id: notionId(it),
      title: it.row.title,
      status: projectStatus(get("status")),
      progress: pct !== null && Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null,
      start_date: (parseDate(get("start")) ?? range.start)?.date ?? null,
      due_date: (parseDate(get("due")) ?? range.end)?.date ?? null,
      description: joinBlocks(normValue(get("summary"))),
      content: joinBlocks(other, md(pageOf(it)?.body)),
      tags: [...parsePeople(get("tags")), ...(prio === "high" ? ["高優先"] : [])],
      owner_key: ownerKey,
      member_keys: peopleKeys(get("people")),
    });
  }

  // ---- 任務
  for (const it of dedupe(rowsOf("task"))) {
    const { get, other } = fieldsOf(it, "task");
    payload.tasks.push({
      notion_id: notionId(it),
      title: it.row.title,
      description: joinBlocks(other, normValue(get("notes")) ? get("notes") : "", md(pageOf(it)?.body)),
      status: taskStatus(get("status")),
      priority: priority(get("priority")) || "medium",
      due_date: parseDate(get("due"))?.date ?? null,
      project_notion_id: projectOf(it, get("project")),
      assignee_keys: peopleKeys(get("people")),
    });
  }

  // ---- 論文
  for (const it of dedupe(rowsOf("publication"))) {
    const { get, other } = fieldsOf(it, "publication");
    const authors: ImportPayload["publications"][number]["authors"] = [];
    const add = (names: string[], first: boolean, corr: boolean) => {
      for (const name of names) {
        const ex = authors.find((a) => personKey(a.name) === personKey(name));
        if (ex) {
          ex.is_first ||= first;
          ex.is_corresponding ||= corr;
        } else authors.push({ key: personToKey(name), name, is_first: first, is_corresponding: corr });
      }
    };
    add(parsePeople(get("firstAuthor")), true, false);
    add(parsePeople(get("collaborators")), false, false);
    add(parsePeople(get("corresponding")), false, true);
    payload.publications.push({
      notion_id: notionId(it),
      title: it.row.title,
      stage: publicationStage(get("status")),
      venue: normValue(get("venue")),
      doi: normValue(get("doi")),
      submitted_at: parseDate(get("submitted"))?.date ?? null,
      published_at: parseDate(get("published"))?.date ?? null,
      notes: joinBlocks(other, normValue(get("notes")), md(pageOf(it)?.body)),
      project_notion_id: projectOf(it, get("project")),
      authors,
    });
  }

  // ---- 軟體
  for (const it of dedupe(rowsOf("software"))) {
    const { get, other } = fieldsOf(it, "software");
    const urls = get("url").match(URL_RE) ?? [];
    const access = [
      get("version") ? `- **版本**：${normValue(get("version"))}` : "",
      get("path") ? `- **路徑**：\`${normValue(get("path"))}\`` : "",
      get("files") ? `- **附件（Notion）**：${normValue(get("files"))}` : "",
      urls.length > 1 ? urls.slice(1).map((u) => `- ${u}`).join("\n") : "",
    ].filter(Boolean);
    payload.software.push({
      notion_id: notionId(it),
      name: it.row.title,
      category: parsePeople(get("category"))[0] ?? "",
      purpose: normValue(get("summary")) || (parsePeople(get("category")).length > 1 ? parsePeople(get("category")).join("、") : ""),
      access_info: joinBlocks(access.join("\n"), other),
      install_guide: md(pageOf(it)?.body),
      url: urls[0] ?? "",
      docs_url: (get("docsUrl").match(URL_RE) ?? [])[0] ?? "",
      contact_key: parsePeople(get("people")).map(personToKey).find(Boolean) ?? null,
    });
  }

  // ---- Pipelines
  for (const it of dedupe(rowsOf("pipeline"))) {
    const { get, other } = fieldsOf(it, "pipeline");
    const head = [
      get("path") ? `- **路徑**：\`${normValue(get("path"))}\`` : "",
      get("status") ? `- **狀態**：${normValue(get("status"))}` : "",
      get("files") ? `- **附件（Notion）**：${normValue(get("files"))}` : "",
    ].filter(Boolean);
    payload.pipelines.push({
      notion_id: notionId(it),
      name: it.row.title,
      description: joinBlocks(head.join("\n"), other, get("tools") ? `## 使用工具\n\n${md(get("tools"))}` : "", normValue(get("notes")), md(pageOf(it)?.body)),
      version: normValue(get("version")).slice(0, 40),
      tags: parsePeople(get("tags")),
      maintainer_key: parsePeople(get("people")).map(personToKey).find(Boolean) ?? null,
      project_notion_id: projectOf(it, get("project")),
    });
  }

  // ---- 會議
  for (const it of dedupe(rowsOf("meeting"))) {
    const { get, other } = fieldsOf(it, "meeting");
    const when = parseDate(get("date")) ?? parseDate(it.row.title);
    if (!when) continue;
    const links = (get("link").match(URL_RE) ?? []).map((url, i) => ({ label: i ? `連結 ${i + 1}` : "會議連結", url }));
    const project = projectOf(it, get("project"));
    payload.meetings.push({
      notion_id: notionId(it),
      title: it.row.title,
      type: meetingType(`${get("type")} ${it.row.title}`),
      starts_at: `${when.date}T${when.time ?? "00:00"}:00+08:00`,
      summary: joinBlocks(
        get("remark") ? `> ${normValue(get("remark"))}` : "",
        get("files") ? `- **附件（Notion）**：${normValue(get("files"))}` : "",
        other,
        md(pageOf(it)?.body),
      ),
      links,
      attendee_keys: peopleKeys(get("people")),
      project_notion_ids: project ? [project] : [],
    });
  }

  // ---- 文件：資料庫列（例如專案文件）與獨立頁面，放在新生入門「Notion 匯入」底下
  const docRows = dedupe(rowsOf("document"));
  if (docRows.length || choices.pages.size) payload.documents.push({ notion_id: ROOT_DOC, title: "Notion 匯入", content: "從 Notion 匯入的頁面。可在「頁面設定」移到其他位置。", parent_notion_id: null });
  const dbGroups = new Set<string>();
  for (const it of docRows) {
    const groupId = `db-${it.db.id}`;
    if (!dbGroups.has(groupId)) {
      dbGroups.add(groupId);
      const parent = it.db.parentPageId ? exp.pages.get(it.db.parentPageId)?.title : null;
      payload.documents.push({ notion_id: groupId, title: parent ? `${it.db.name}（${parent}）` : it.db.name, content: "", parent_notion_id: ROOT_DOC });
    }
    const { other } = fieldsOf(it, "document");
    payload.documents.push({ notion_id: notionId(it), title: it.row.title, content: joinBlocks(other, md(pageOf(it)?.body)), parent_notion_id: groupId });
  }
  const docIds = new Set(payload.documents.map((d) => d.notion_id));
  for (const id of choices.pages) {
    if (id === choices.faqPageId) continue;
    const page = exp.pages.get(id);
    if (!page) continue;
    // 上層：第一個連到它、且也會匯入成文件的頁面
    const parent = [...exp.pages.values()].find((p) => p.id !== id && p.linkedPages.includes(id) && (choices.pages.has(p.id) || docIds.has(p.id)) && p.id !== choices.faqPageId);
    payload.documents.push({ notion_id: id, title: page.title, content: md(page.fullBody), parent_notion_id: parent?.id ?? ROOT_DOC });
  }

  // ---- FAQ
  if (choices.faqPageId) {
    const page = exp.pages.get(choices.faqPageId);
    if (page) payload.faqs.push(...parseFaqPage(page, imported));
  }

  // 沒有用到的已存在成員不需要送出
  const used = new Set<string>();
  const mark = (k: string | null | undefined) => k && used.add(k);
  for (const p of payload.projects) [p.owner_key, ...p.member_keys].forEach(mark);
  for (const t of payload.tasks) t.assignee_keys.forEach(mark);
  for (const p of payload.publications) p.authors.forEach((a) => mark(a.key));
  for (const s of payload.software) mark(s.contact_key);
  for (const p of payload.pipelines) mark(p.maintainer_key);
  for (const m of payload.meetings) m.attendee_keys.forEach(mark);
  payload.members = payload.members.filter((m) => !m.key.startsWith("member:") || used.has(m.key));
  return payload;
}

/** 頁面清單：不屬於資料庫列的頁面（獨立頁面） */
export function standalonePages(exp: NotionExport) {
  return [...exp.pages.values()].filter((p) => !exp.rowPageIds.has(p.id));
}

/** 預設要匯入的獨立頁面：已選資料列內文中連到的子頁面、名稱像入門指南的頁面 */
export function defaultPages(exp: NotionExport, choices: Pick<Choices, "targets" | "excludedRows">) {
  const roots: string[] = [];
  for (const db of exp.databases) {
    if ((choices.targets[db.id] ?? "skip") === "skip") continue;
    for (const r of db.rows) if (r.pageId && !choices.excludedRows.has(r.key)) roots.push(r.pageId);
  }
  const ids = linkedStandalonePages(exp, roots);
  for (const p of standalonePages(exp)) if (/orientation|入門|guide|指南|handbook|手冊/i.test(p.title) && p.fullBody.trim()) ids.add(p.id);
  return ids;
}

export function guessFaqPage(exp: NotionExport) {
  return standalonePages(exp).find((p) => /^(faq|常見問題|q&a)$/i.test(p.title.trim()))?.id ?? null;
}
