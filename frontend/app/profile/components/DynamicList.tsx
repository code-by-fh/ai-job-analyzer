"use client";
import React, { useState } from "react";
import { useLanguage } from "../../components/LanguageProvider";
import ConfirmModal from "../../components/ConfirmModal";
import AutoResizeTextarea from "../../components/AutoResizeTextarea";

interface DynamicListProps {
  title: string;
  items: any[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: string, value: string) => void;
  fields: { name: string; placeholder: string; type?: "text" | "textarea" }[];
}

export default function DynamicList({
  title,
  items,
  onAdd,
  onRemove,
  onChange,
  fields,
}: DynamicListProps) {
  const { t } = useLanguage();
  const [indexToRemove, setIndexToRemove] = useState<number | null>(null);

  const handleRemoveClick = (index: number) => {
    setIndexToRemove(index);
  };

  const confirmRemove = () => {
    if (indexToRemove !== null) {
      onRemove(indexToRemove);
      setIndexToRemove(null);
    }
  };

  return (
    <div className="space-y-4">
      <ConfirmModal
        isOpen={indexToRemove !== null}
        onClose={() => setIndexToRemove(null)}
        onConfirm={confirmRemove}
        title={t("removeEntry") || "Remove Entry"}
        message={
          t("areYouCertain") || "Are you sure you want to remove this item?"
        }
        confirmText={t("remove") || "Remove"}
        isDestructive
      />

      <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 pb-2">
        <h3 className="font-bold text-slate-800 dark:text-white text-lg">
          {title}
        </h3>
        <button
          type="button"
          onClick={onAdd}
          className="text-xs bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-500/30 font-bold transition-colors flex items-center gap-1 cursor-pointer border border-indigo-100 dark:border-indigo-500/20"
        >
          <span className="text-lg leading-none">+</span> {t("addItem")}
        </button>
      </div>

      {items.length === 0 && (
        <div className="text-center p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50/50 dark:bg-slate-900/20">
          <p className="text-sm text-slate-400 dark:text-slate-500 italic">
            {t("noEntries")}
          </p>
        </div>
      )}

      {items.map((item, index) => (
        <div
          key={index}
          className="bg-slate-50 dark:bg-slate-950/30 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm relative group hover:border-indigo-200 dark:hover:border-indigo-500/30 transition-colors"
        >
          {/* DELETE BUTTON */}
          <button
            type="button"
            onClick={() => handleRemoveClick(index)}
            className="absolute top-3 right-3 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-all cursor-pointer"
            title={t("removeEntry")}
          >
            {/* SVG Trash Icon */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
          </button>

          <div className="grid gap-4 mt-2">
            {fields.map((field) => (
              <div key={field.name}>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 ml-1">
                  {field.placeholder.split("(")[0]}
                </label>
                {field.type === "textarea" ? (
                  <AutoResizeTextarea
                    value={item[field.name] || ""}
                    onChange={(e) =>
                      onChange(index, field.name, e.target.value)
                    }
                    placeholder={field.placeholder}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
                    rows={1}
                  />
                ) : (
                  <input
                    type="text"
                    value={item[field.name] || ""}
                    onChange={(e) =>
                      onChange(index, field.name, e.target.value)
                    }
                    placeholder={field.placeholder}
                    className="w-full border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
