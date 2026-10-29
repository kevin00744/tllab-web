import { MemberAvatar } from "@/components/layout/user-menu";
import { cn } from "@/lib/utils";
import type { MemberBrief } from "@/types/entities";

export function AvatarStack({ members, max = 3, className }: { members: MemberBrief[]; max?: number; className?: string }) {
  if (members.length === 0) return null;
  const shown = members.slice(0, max);
  return (
    <span className={cn("flex items-center", className)} title={members.map((m) => m.name).join("、")}>
      {shown.map((m) => (
        <MemberAvatar key={m.id} member={m} className="-ml-1.5 size-6 ring-2 ring-background first:ml-0" />
      ))}
      {members.length > max ? (
        <span className="-ml-1.5 flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-background">
          +{members.length - max}
        </span>
      ) : null}
    </span>
  );
}
