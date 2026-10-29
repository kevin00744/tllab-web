export type LinkItem = { label: string; url: string };

/** 有填網址但格式不是 http(s) 的連結 */
export const hasInvalidLink = (links: LinkItem[]) => links.some((l) => l.url.trim() !== "" && !/^https?:\/\/\S+$/i.test(l.url.trim()));

/** 顯示用名稱：沒有名稱時用網址主機名 */
export function linkText(l: LinkItem) {
  if (l.label.trim()) return l.label;
  return l.url.replace(/^https?:\/\//i, "").split(/[/?#]/)[0];
}
