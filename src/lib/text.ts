/** Markdown → 純文字摘要（Dashboard 卡片用，不做完整解析） */
export function plainExcerpt(markdown: string | null | undefined, max = 140) {
  if (!markdown) return "";
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export type Heading = { level: 1 | 2 | 3; text: string; id: string };

/**
 * 取出 Markdown 的 1–3 級標題（目錄用）。id 依出現順序編號，
 * 與 <Markdown anchors> 渲染時加在標題上的 id 相同。
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  let fence = false;
  for (const line of markdown.split("\n")) {
    if (/^\s{0,3}(```|~~~)/.test(line)) fence = !fence;
    if (fence) continue;
    const m = /^\s{0,3}(#{1,3})\s+(.+?)\s*#*\s*$/.exec(line);
    if (!m) continue;
    headings.push({ level: m[1].length as 1 | 2 | 3, text: plainExcerpt(m[2], 120), id: `h-${headings.length + 1}` });
  }
  return headings;
}
