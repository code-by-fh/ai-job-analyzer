import React from 'react';

interface DynamicListProps {
  title: string;
  items: any[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onChange: (index: number, field: string, value: string) => void;
  fields: { name: string; placeholder: string; type?: 'text' | 'textarea' }[];
}

export default function DynamicList({ title, items, onAdd, onRemove, onChange, fields }: DynamicListProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center border-b border-slate-100 pb-2">
        <h3 className="font-bold text-slate-800 text-lg">{title}</h3>
        <button 
          type="button"
          onClick={onAdd}
          className="text-sm bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-full hover:bg-indigo-100 font-bold transition-colors flex items-center gap-1 cursor-pointer"
        >
          <span className="text-lg leading-none">+</span> Hinzufügen
        </button>
      </div>

      {items.length === 0 && (
        <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-lg bg-slate-50/50">
            <p className="text-sm text-slate-400 italic">Noch keine Einträge vorhanden.</p>
        </div>
      )}

      {items.map((item, index) => (
        <div key={index} className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm relative group hover:border-indigo-200 transition-colors">
          
          {/* LÖSCHEN BUTTON (Jetzt oben rechts mit Icon) */}
          <button
            type="button"
            onClick={() => onRemove(index)}
            className="absolute top-3 right-3 p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all cursor-pointer"
            title="Diesen Eintrag entfernen"
          >
            {/* SVG Trash Icon */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
          
          <div className="grid gap-4 mt-2">
            {fields.map((field) => (
              <div key={field.name}>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1 ml-1">
                    {field.placeholder.split('(')[0]} {/* Ein kleiner Hack, um Labels aus Placeholder zu generieren, sieht professioneller aus */}
                </label>
                {field.type === 'textarea' ? (
                   <textarea
                     value={item[field.name] || ''}
                     onChange={(e) => onChange(index, field.name, e.target.value)}
                     placeholder={field.placeholder}
                     className="w-full border border-slate-300 bg-slate-50 p-3 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
                     rows={3}
                   />
                ) : (
                  <input
                    type="text"
                    value={item[field.name] || ''}
                    onChange={(e) => onChange(index, field.name, e.target.value)}
                    placeholder={field.placeholder}
                    className="w-full border border-slate-300 bg-slate-50 p-3 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:bg-white focus:border-indigo-500 outline-none transition-all text-slate-900 placeholder:text-slate-400"
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