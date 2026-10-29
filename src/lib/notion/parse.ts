/**
 * Notion 匯出（Markdown & CSV）解析
 * - 每個資料庫匯出為 CSV（`名稱 <id>.csv`，`_all.csv` 為不含篩選的完整版）
 * - 每一列另有一個頁面 `標題 <id>.md`：`# 標題`、屬性區塊（`欄位: 值`）、內文
 * - 連結與關聯欄位以 `名稱 (相對路徑 <id>.md)` 表示，id 為 32 碼十六進位
 * 本檔不依賴瀏覽器或 Node 專屬 API，方便在兩邊執行與測試。
 */
import { parseCsv } from "./csv.ts";

export type NotionFile = { path: string; text: string };

export type NotionPage = {
  id: string;
  title: string;
  /** 標題下方的屬性區塊（僅資料庫列的頁面才有意義） */
  props: Record<string, string>;
  /** 去掉屬性區塊後的內文 */
  body: string;
  /** 含屬性區塊的完整內文（獨立頁面使用） */
  fullBody: string;
  /** 內文中連到的其他頁面與資料庫 id */
  linkedPages: string[];
  linkedDatabases: string[];
};

export type NotionRow = {
  /** 資料庫內唯一的鍵（`<資料庫 id>:<列序>`） */
  key: string;
  title: string;
  values: Record<string, string>;
  /** 對應的頁面 id；同一頁面可能出現在多個檢視（linked view） */
  pageId: string | null;
};

export type NotionDatabase = {
  id: string;
  name: string;
  columns: string[];
  rows: NotionRow[];
  /** 內嵌這個資料庫的頁面（例如專案頁裡的任務看板） */
  parentPageId: string | null;
};

export type NotionExport = {
  pages: Map<string, NotionPage>;
  databases: NotionDatabase[];
  /** 屬於某個資料庫的頁面 id */
  rowPageIds: Set<string>;
};

const ID = /([0-9a-f]{32})(?:_all)?\.(md|csv)$/i;
// 關聯值裡的連結：`名稱 (路徑 <id>.md)`；路徑可能含一層括號，例如 Histiocytosis(PMH)
export const RELATION_LINK = /\s*\((?:[^()]|\([^()]*\))*?([0-9a-f]{32})\.(?:md|csv)\)/gi;

const baseName = (path: string) => path.split("/").pop() ?? path;
const titleFromFile = (path: string) =>
  baseName(path)
    .replace(ID, "")
    .trim();

export function idOf(path: string): string | null {
  const m = ID.exec(baseName(path));
  return m ? m[1].toLowerCase() : null;
}

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** 內文中 Markdown 連結指向的 id */
function linksIn(body: string, ext: "md" | "csv") {
  const ids: string[] = [];
  const re = /\]\(([^)\s]*?(?:\([^)\s]*\)[^)\s]*?)*)\)/g;
  for (const m of body.matchAll(re)) {
    const target = safeDecode(m[1]);
    const id = ID.exec(target.split("/").pop() ?? "");
    if (id && id[2].toLowerCase() === ext) ids.push(id[1].toLowerCase());
  }
  return [...new Set(ids)];
}

const PROP_LINE = /^([^:\n#>*\-|`[\]][^:\n]{0,79}): (.*)$/;

export function parsePage(path: string, raw: string): NotionPage {
  const text = raw.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const lines = text.split("\n");
  let i = 0;
  let title = titleFromFile(path);
  if (lines[0]?.startsWith("# ")) {
    title = lines[0].slice(2).trim();
    i = 1;
  }
  while (i < lines.length && lines[i].trim() === "") i++;
  const bodyStart = i;
  const props: Record<string, string> = {};
  let lastKey: string | null = null;
  // 屬性區塊：到第一個空行為止；多行的屬性值（例如備註）後續行接在前一個屬性後面
  while (i < lines.length && lines[i].trim() !== "") {
    const m = PROP_LINE.exec(lines[i]);
    if (m) {
      lastKey = m[1].trim();
      props[lastKey] = m[2].trim();
    } else if (lastKey) {
      props[lastKey] += `\n${lines[i]}`;
    } else break;
    i++;
  }
  // 屬性區塊後一定是空行或結尾；否則不是屬性區塊（例如內文第一行剛好含冒號）
  const isBlock = i > bodyStart && (i >= lines.length || lines[i].trim() === "");
  const fullBody = lines.slice(bodyStart).join("\n").trim();
  const body = isBlock ? lines.slice(i).join("\n").trim() : fullBody;
  return {
    id: idOf(path)!,
    title,
    props: isBlock ? props : {},
    body,
    fullBody,
    linkedPages: linksIn(text, "md"),
    linkedDatabases: linksIn(text, "csv"),
  };
}

/** 比對用：去掉關聯連結、合併空白 */
export const normValue = (v: string | undefined) => (v ?? "").replace(RELATION_LINK, "").replace(/\s+/g, " ").trim();

export function parseExport(files: NotionFile[]): NotionExport {
  const pages = new Map<string, NotionPage>();
  const csvs = new Map<string, { path: string; text: string; all: boolean }>();
  for (const f of files) {
    const id = idOf(f.path);
    if (!id) continue;
    if (/\.md$/i.test(f.path)) pages.set(id, parsePage(f.path, f.text));
    else if (/\.csv$/i.test(f.path)) {
      const all = /_all\.csv$/i.test(f.path);
      const prev = csvs.get(id);
      // 同一資料庫有 `_all.csv` 時以它為準（不受檢視篩選影響）
      if (!prev || (all && !prev.all)) csvs.set(id, { path: f.path, text: f.text, all });
    }
  }

  // 標題 → 頁面（用於比對資料庫列）
  const byTitle = new Map<string, NotionPage[]>();
  for (const p of pages.values()) {
    const k = p.title.trim();
    byTitle.set(k, [...(byTitle.get(k) ?? []), p]);
  }
  // 內嵌資料庫的上層頁面
  const parentOf = new Map<string, string>();
  for (const p of pages.values()) for (const db of p.linkedDatabases) if (!parentOf.has(db)) parentOf.set(db, p.id);

  const databases: NotionDatabase[] = [];
  const rowPageIds = new Set<string>();
  for (const [id, csv] of csvs) {
    const table = parseCsv(csv.text).filter((r) => r.some((c) => c.trim() !== ""));
    if (!table.length) continue;
    const columns = table[0].map((c) => c.trim());
    const claimed = new Set<string>();
    const rows: NotionRow[] = table.slice(1).map((cells, index) => {
      const values: Record<string, string> = {};
      columns.forEach((c, j) => (values[c] = (cells[j] ?? "").trim()));
      const title = (cells[0] ?? "").trim();
      // 同標題的頁面中，挑屬性最吻合者（同一資料庫內不重複使用）
      let best: { page: NotionPage; score: number } | null = null;
      for (const page of byTitle.get(title) ?? []) {
        if (claimed.has(page.id)) continue;
        let score = 0;
        for (const c of columns.slice(1)) {
          const a = normValue(values[c]);
          const b = normValue(page.props[c]);
          if (a === b) score += a ? 2 : 0;
          else score -= 1;
        }
        if (!best || score > best.score) best = { page, score };
      }
      if (best) {
        claimed.add(best.page.id);
        rowPageIds.add(best.page.id);
      }
      return { key: `${id}:${index}`, title, values, pageId: best?.page.id ?? null };
    });
    databases.push({ id, name: titleFromFile(csv.path).replace(/_all$/, "").trim(), columns, rows, parentPageId: parentOf.get(id) ?? null });
  }
  return { pages, databases, rowPageIds };
}

/** 關聯欄位 → [{名稱, id}] */
export function parseRelations(value: string | undefined): { name: string; id: string | null }[] {
  if (!value?.trim()) return [];
  const out: { name: string; id: string | null }[] = [];
  let last = 0;
  for (const m of value.matchAll(RELATION_LINK)) {
    const name = value.slice(last, m.index).replace(/^\s*,\s*/, "").trim();
    if (name) out.push({ name, id: m[1].toLowerCase() });
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = value.slice(last).replace(/^\s*,\s*/, "").trim();
  if (!out.length && rest) return rest.split(/\s*,\s*/).filter(Boolean).map((name) => ({ name, id: null }));
  return out;
}

/** 人員欄位：以逗號分隔的姓名 */
export const parsePeople = (value: string | undefined) =>
  (value ?? "")
    .replace(RELATION_LINK, "")
    .split(/\s*[,，、]\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
