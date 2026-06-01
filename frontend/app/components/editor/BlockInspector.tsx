"use client";

import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff } from "lucide-react";

interface Block {
  id: string;
  label: string;
  visible: boolean;
}

interface BlockInspectorProps {
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

function SortableBlock({
  block,
  onToggle,
}: {
  block: Block;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: block.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="flex items-center gap-2 p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-slate-400 cursor-grab active:cursor-grabbing"
        aria-label="Verschieben"
      >
        <GripVertical className="w-4 h-4" />
      </button>
      <span className="flex-1 text-sm">{block.label}</span>
      <button
        onClick={() => onToggle(block.id)}
        className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        aria-label={block.visible ? "Ausblenden" : "Einblenden"}
      >
        {block.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
    </div>
  );
}

export default function BlockInspector({ iframeRef }: BlockInspectorProps) {
  const [blocks, setBlocks] = useState<Block[]>([]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const els = Array.from(doc.querySelectorAll("[data-block]"));
      setBlocks(
        els.map((el, i) => ({
          id: el.getAttribute("data-block") || `block-${i}`,
          label: el.getAttribute("data-block-label") || el.getAttribute("data-block") || `Block ${i}`,
          visible: !(el as HTMLElement).hidden,
        }))
      );
    };
    iframe.addEventListener("load", onLoad);
    return () => iframe.removeEventListener("load", onLoad);
  }, [iframeRef]);

  const sensors = useSensors(useSensor(PointerSensor));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = blocks.findIndex((b) => b.id === active.id);
    const newIndex = blocks.findIndex((b) => b.id === over.id);
    const nextBlocks = arrayMove(blocks, oldIndex, newIndex);
    setBlocks(nextBlocks);

    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const container = doc.querySelector("[data-block]")?.parentElement;
    if (!container) return;
    nextBlocks.forEach(({ id }) => {
      const el = doc.querySelector(`[data-block="${id}"]`);
      if (el) container.appendChild(el);
    });
  }

  function handleToggle(id: string) {
    const doc = iframeRef.current?.contentDocument;
    const el = doc?.querySelector(`[data-block="${id}"]`) as HTMLElement | null;
    if (!el) return;
    el.hidden = !el.hidden;
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, visible: !b.visible } : b))
    );
  }

  if (blocks.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-400">
        Keine Blöcke gefunden. Das Template benötigt <code>data-block</code>-Attribute.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          {blocks.map((block) => (
            <SortableBlock key={block.id} block={block} onToggle={handleToggle} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
