"use client";

import {
  closestCorners,
  DndContext,
  pointerWithin,
  type CollisionDetection,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { toast } from "sonner";

import { moveTask } from "@/app/(app)/tasks/actions";
import { Badge } from "@/components/ui/badge";
import { format } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import { statusLabel, taskStatusTone } from "@/lib/status";
import { cn } from "@/lib/utils";
import type { TaskStatus } from "@/types/db";
import type { Task } from "@/types/entities";
import { TaskCardBody } from "./task-card";
import { useTasks } from "./task-provider";

const COLUMNS: TaskStatus[] = ["todo", "in_progress", "in_review", "done"];
type Columns = Record<TaskStatus, Task[]>;

// 滑鼠／觸控：以指標所在的卡片或欄為準（拖到欄位下方空白處也能放下）；
// 鍵盤拖拉沒有指標座標，退回 closestCorners
const collision: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCorners(args);
};

function group(tasks: Task[]): Columns {
  const cols: Columns = { todo: [], in_progress: [], in_review: [], done: [] };
  for (const task of tasks) cols[task.status].push(task);
  for (const s of COLUMNS) cols[s].sort((a, b) => a.position - b.position);
  return cols;
}

function findColumn(cols: Columns, id: string): TaskStatus | null {
  if (id.startsWith("col:")) return id.slice(4) as TaskStatus;
  return COLUMNS.find((s) => cols[s].some((t) => t.id === id)) ?? null;
}

/** 新位置＝前後兩張卡片 position 的中間值，只需更新被拖動的那一筆 */
function positionAt(list: Task[], index: number) {
  const prev = list[index - 1]?.position;
  const next = list[index + 1]?.position;
  if (prev === undefined && next === undefined) return 1;
  if (prev === undefined) return next! - 1;
  if (next === undefined) return prev + 1;
  return (prev + next) / 2;
}

export function TasksBoard({ tasks, today }: { tasks: Task[]; today: string }) {
  const { t } = useI18n();
  const { openTask, newTask, options } = useTasks();
  const [cols, setCols] = useState(() => group(tasks));
  const [snapshot, setSnapshot] = useState<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  // 伺服器資料更新（新增、編輯後 refresh）時重新分組
  const [source, setSource] = useState(tasks);
  if (source !== tasks) {
    setSource(tasks);
    setCols(group(tasks));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    // 鍵盤：Space 拿起／放下卡片，Enter 開啟任務
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );
  const active = activeId ? COLUMNS.flatMap((s) => cols[s]).find((x) => x.id === activeId) : null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setSnapshot(cols);
  }

  // 拖到其他欄時先移過去（即時預覽）
  function onDragOver(e: DragOverEvent) {
    if (!e.over) return;
    const from = findColumn(cols, String(e.active.id));
    const to = findColumn(cols, String(e.over.id));
    if (!from || !to || from === to) return;
    setCols((c) => {
      const moving = c[from].find((x) => x.id === e.active.id);
      if (!moving) return c;
      const overIndex = c[to].findIndex((x) => x.id === e.over!.id);
      const insertAt = overIndex >= 0 ? overIndex : c[to].length;
      const target = [...c[to]];
      target.splice(insertAt, 0, { ...moving, status: to });
      return { ...c, [from]: c[from].filter((x) => x.id !== moving.id), [to]: target };
    });
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const before = snapshot;
    setSnapshot(null);
    if (!e.over || !before) return setCols(before ?? cols);

    const column = findColumn(cols, String(e.active.id));
    if (!column) return;
    const list = [...cols[column]];
    const oldIndex = list.findIndex((x) => x.id === e.active.id);
    const overIndex = list.findIndex((x) => x.id === e.over!.id);
    const newIndex = overIndex >= 0 ? overIndex : list.length - 1;
    const [moved] = list.splice(oldIndex, 1);
    list.splice(newIndex, 0, moved);

    const original = COLUMNS.flatMap((s) => before[s]).find((x) => x.id === moved.id)!;
    const position = positionAt(list, newIndex);
    if (original.status === column && list.indexOf(moved) === before[column].findIndex((x) => x.id === moved.id)) {
      return setCols(before);
    }

    list[newIndex] = { ...moved, status: column, position };
    setCols((c) => ({ ...c, [column]: list }));

    const result = await moveTask(moved.id, column, position);
    if (!result.ok) {
      toast.error(t.errors[result.error]);
      setCols(before);
      return;
    }
    if (original.status !== column) toast.success(format(t.tasksPage.moved, { status: statusLabel(t, "task", column) }));
    setCols((c) => ({ ...c, [column]: c[column].map((x) => (x.id === moved.id ? result.data : x)) }));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        setActiveId(null);
        if (snapshot) setCols(snapshot);
        setSnapshot(null);
      }}
    >
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
        {COLUMNS.map((status) => (
          <Column
            key={status}
            status={status}
            tasks={cols[status]}
            today={today}
            onOpen={openTask}
            onAdd={options.can_create ? () => newTask({ status }) : undefined}
          />
        ))}
      </div>
      <DragOverlay>
        {active ? (
          <div className="rotate-1 rounded-lg border bg-card p-3 shadow-lg">
            <TaskCardBody task={active} today={today} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function Column({
  status,
  tasks,
  today,
  onOpen,
  onAdd,
}: {
  status: TaskStatus;
  tasks: Task[];
  today: string;
  onOpen: (task: Task) => void;
  onAdd?: () => void;
}) {
  const { t } = useI18n();
  const { setNodeRef, isOver } = useDroppable({ id: `col:${status}` });
  return (
    <section
      ref={setNodeRef}
      aria-label={statusLabel(t, "task", status)}
      className={cn(
        "flex w-72 shrink-0 snap-start flex-col rounded-xl bg-muted/50 p-2 md:w-auto",
        isOver && "ring-2 ring-primary/30",
      )}
    >
      <header className="flex items-center justify-between px-1.5 pt-1 pb-2">
        <span className="flex items-center gap-2">
          <Badge tone={taskStatusTone[status]}>{statusLabel(t, "task", status)}</Badge>
          <span className="text-xs text-muted-foreground tabular-nums">{tasks.length}</span>
        </span>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="rounded px-1.5 text-lg leading-none text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`${t.tasksPage.new}：${statusLabel(t, "task", status)}`}
          >
            +
          </button>
        ) : null}
      </header>
      <SortableContext items={tasks.map((x) => x.id)} strategy={verticalListSortingStrategy}>
        <ul className="flex min-h-16 flex-col gap-2">
          {tasks.map((task) => (
            <SortableCard key={task.id} task={task} today={today} onOpen={onOpen} />
          ))}
        </ul>
      </SortableContext>
    </section>
  );
}

function SortableCard({ task, today, onOpen }: { task: Task; today: string; onOpen: (task: Task) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !task.editable,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-lg border bg-card p-3 shadow-xs transition-shadow hover:shadow-sm",
        task.editable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
      data-task-id={task.id}
      // 不可拖拉的卡片仍可點開檢視，不套用 dnd-kit 的 aria-disabled
      {...(task.editable ? attributes : { role: "button", tabIndex: 0 })}
      {...listeners}
      onClick={() => onOpen(task)}
      onKeyDown={(e) => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter") onOpen(task);
      }}
    >
      <TaskCardBody task={task} today={today} />
    </li>
  );
}
