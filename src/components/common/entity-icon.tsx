import { isIconUrl } from "@/lib/icon";
import { cn } from "@/lib/utils";

/** 顯示 emoji 或上傳的圖示圖片（大小跟隨文字） */
export function EntityIcon({ value, className }: { value: string | null | undefined; className?: string }) {
  if (!value) return null;
  if (isIconUrl(value)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={value} alt="" className={cn("inline-block size-[1.15em] rounded-[0.2em] object-cover align-[-0.2em]", className)} />;
  }
  return <span className={className}>{value}</span>;
}
