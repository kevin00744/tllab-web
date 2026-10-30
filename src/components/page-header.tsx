import { EntityIcon } from "@/components/common/entity-icon";

export function PageHeader({
  emoji,
  title,
  description,
  actions,
}: {
  emoji: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="mb-2 text-4xl leading-none" aria-hidden>
          <EntityIcon value={emoji} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}
