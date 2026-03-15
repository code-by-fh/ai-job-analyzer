"use client";
import { useState } from 'react';
import { Platform } from './types';
import { NotificationTemplate } from '../../../components/TemplateManager';

interface PushoverTemplateModalProps {
    platform: Platform;
    templates: NotificationTemplate[];
    templateValue: string;
    onTemplateChange: (value: string) => void;
    onClose: () => void;
    onSave: () => void;
    testStatus: 'idle' | 'sending' | 'ok' | 'error';
    testError: string | null;
    onSendTest: () => void;
    isAdmin: boolean;
}

const PLACEHOLDER = `$company - Score: $match_score%

$reasoning

$url`;

export default function PushoverTemplateModal({
    platform,
    templates,
    templateValue,
    onTemplateChange,
    onClose,
    onSave,
    testStatus,
    testError,
    onSendTest,
    isAdmin,
}: PushoverTemplateModalProps) {
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const pushoverTemplates = templates.filter(t => t.type === 'PUSHOVER');

    const handleTemplateSelect = (id: string) => {
        if (!id) { setSelectedTemplateId(''); return; }
        const tpl = pushoverTemplates.find(t => String(t.id) === id);
        if (!tpl) return;
        if (templateValue && templateValue !== tpl.content) {
            if (!confirm('Der aktuelle Inhalt wird überschrieben. Fortfahren?')) return;
        }
        onTemplateChange(tpl.content);
        setSelectedTemplateId(id);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-800">
                    <div>
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm">Pushover Template — {platform.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">
                            Variablen: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">$title</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">$company</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">$match_score</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">$reasoning</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">$url</code>
                        </p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-5 flex-1 overflow-auto">
                    {/* Template selector */}
                    {pushoverTemplates.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Template laden</p>
                            <select
                                value={selectedTemplateId}
                                onChange={e => handleTemplateSelect(e.target.value)}
                                className="w-full text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                                <option value="">Template auswählen...</option>
                                {pushoverTemplates.map(t => (
                                    <option key={t.id} value={String(t.id)}>
                                        {t.is_admin ? '🔒 ' : ''}{t.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    <textarea
                        value={templateValue}
                        onChange={(e) => onTemplateChange(e.target.value)}
                        placeholder={PLACEHOLDER}
                        rows={6}
                        className="w-full font-mono text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                        spellCheck={false}
                    />
                    {templateValue && (
                        <button onClick={() => { onTemplateChange(''); setSelectedTemplateId(''); }} className="mt-2 text-xs text-rose-500 hover:text-rose-600 transition-colors cursor-pointer">
                            Auf Standard zurücksetzen
                        </button>
                    )}

                    <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                        Standard-Nachricht wenn kein Template gesetzt: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded font-mono">$company - Score: $match_score%\n\n$reasoning (gekürzt)...</code>
                    </p>
                </div>

                <div className="flex justify-between items-center p-5 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={onSendTest}
                            disabled={testStatus === 'sending'}
                            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60 ${
                                testStatus === 'ok' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-800' :
                                testStatus === 'error' ? 'text-rose-600 bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-800' :
                                'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600'
                            }`}
                        >
                            {testStatus === 'sending' && <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>}
                            {testStatus === 'ok' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>}
                            {testStatus === 'error' && <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>}
                            {testStatus === 'ok' ? 'Gesendet!' : testStatus === 'error' ? 'Fehlgeschlagen' : 'Test-Benachrichtigung senden'}
                        </button>
                        {testStatus === 'error' && testError && isAdmin && (
                            <p className="text-[10px] text-rose-500 font-mono max-w-xs break-all">{testError}</p>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer">
                            Abbrechen
                        </button>
                        <button onClick={onSave} className="px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer shadow-sm">
                            Template speichern
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
