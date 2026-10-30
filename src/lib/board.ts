// 留言內文的標註格式：@[名稱](member uuid)、#[專案名稱](project uuid)（與 migration 21 相同）
const TOKEN = /([@#])\[([^\]\n]+)\]\(([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\)/g;

export type BoardSegment =
  | { type: "text"; text: string }
  | { type: "member"; id: string; name: string }
  | { type: "project"; id: string; name: string };

export function parseBody(body: string): BoardSegment[] {
  const out: BoardSegment[] = [];
  let last = 0;
  for (const m of body.matchAll(TOKEN)) {
    if (m.index > last) out.push({ type: "text", text: body.slice(last, m.index) });
    out.push({ type: m[1] === "@" ? "member" : "project", id: m[3], name: m[2] });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ type: "text", text: body.slice(last) });
  return out;
}

export type Picked = { kind: "@" | "#"; id: string; name: string };

/** 編輯時：標註轉回「@名稱」顯示，並記住對應的 id */
export function decodeBody(body: string): { text: string; picked: Picked[] } {
  const picked: Picked[] = [];
  const text = body.replace(TOKEN, (_, kind: "@" | "#", name: string, id: string) => {
    picked.push({ kind, id, name });
    return `${kind}${name}`;
  });
  return { text, picked };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 送出時：從選單選過的「@名稱」「#專案」轉成標註格式（較長的名稱優先，避免部分重疊） */
export function encodeBody(text: string, picked: Picked[]): string {
  const unique = [...new Map(picked.map((p) => [`${p.kind}${p.name}`, p])).values()].sort((a, b) => b.name.length - a.name.length);
  let out = text;
  for (const p of unique) {
    const name = p.name.replace(/[[\]]/g, "");
    out = out.replace(new RegExp(`${escape(p.kind + p.name)}(?![\\p{L}\\p{N}_])`, "gu"), `${p.kind}[${name}](${p.id})`);
  }
  return out;
}
