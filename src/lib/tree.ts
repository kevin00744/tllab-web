import type { DocumentItem } from "@/types/entities";

export type DocNode = DocumentItem & { children: DocNode[] };

/** 平面清單（已依 sort_order 排序）→ 樹狀；上層不存在的頁面視為最上層 */
export function buildTree(items: DocumentItem[]): DocNode[] {
  const nodes = new Map(items.map((d) => [d.id, { ...d, children: [] as DocNode[] }]));
  const roots: DocNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    (parent ? parent.children : roots).push(node);
  }
  return roots;
}

/** 依目錄順序（深度優先）排列，用於上一頁／下一頁 */
export function flattenTree(nodes: DocNode[]): DocNode[] {
  return nodes.flatMap((n) => [n, ...flattenTree(n.children)]);
}

/** 由最上層到目前頁面的路徑（麵包屑） */
export function ancestorsOf(items: DocumentItem[], id: string): DocumentItem[] {
  const byId = new Map(items.map((d) => [d.id, d]));
  const path: DocumentItem[] = [];
  let current = byId.get(id);
  while (current && path.length < 20) {
    path.unshift(current);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return path;
}

/** 某頁面及其所有子頁面的 id（選擇上層時排除） */
export function descendantIds(items: DocumentItem[], id: string): Set<string> {
  const result = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const d of items) {
      if (d.parent_id && result.has(d.parent_id) && !result.has(d.id)) {
        result.add(d.id);
        grew = true;
      }
    }
  }
  return result;
}
