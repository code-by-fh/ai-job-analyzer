"use client";
import { useState, useEffect } from 'react';
import { fetchWithAuth } from './AuthProvider';
import { FileText, Plus, Pencil, Trash2, Lock, Mail, Smartphone, Check, X } from 'lucide-react';

export interface NotificationTemplate {
    id: number;
    name: string;
    type: string; // "GMAIL" | "PUSHOVER"
    content: string;
    is_admin: boolean;
    user_id: number | null;
    created_at: string;
}

interface TemplateManagerProps {
    isAdmin: boolean;
    // If true, uses /admin/notification-templates for mutations (admin settings page)
    // If false, uses /notification-templates (user settings page)
    adminMode: boolean;
}

type TabType = 'GMAIL' | 'PUSHOVER';

interface EditState {
    id: number | null; // null = new
    name: string;
    content: string;
}

const GMAIL_PLACEHOLDER = `<html>
<body>
  <p>Hallo $userName,</p>
  <h1>$jobCount neue Job-Matches für dich</h1>
  {{#jobs}}
  <div style="margin-bottom:20px;border-bottom:1px solid #eee">
    <h2>$title – $company ($match_score%)</h2>
    <p>$reasoning</p>
    <a href="$url">Details anschauen</a>
  </div>
  {{/jobs}}
</body>
</html>`;

const PUSHOVER_PLACEHOLDER = `$company - Score: $match_score%

$reasoning

$url`;

export default function TemplateManager({ isAdmin, adminMode }: TemplateManagerProps) {
    const [activeTab, setActiveTab] = useState<TabType>('GMAIL');
    const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [editState, setEditState] = useState<EditState | null>(null);
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState('');

    const baseUrl = process.env.NEXT_PUBLIC_API_URL;
    const mutateBase = adminMode ? `${baseUrl}/admin/notification-templates` : `${baseUrl}/notification-templates`;

    const fetchTemplates = async () => {
        try {
            const res = await fetchWithAuth(`${baseUrl}/notification-templates`);
            if (res.ok) {
                setTemplates(await res.json());
            }
        } catch { }
        setLoading(false);
    };

    useEffect(() => { fetchTemplates(); }, []);

    const filtered = templates.filter(t => t.type === activeTab);

    const startNew = () => setEditState({ id: null, name: '', content: '' });

    const startEdit = (t: NotificationTemplate) => {
        setEditState({ id: t.id, name: t.name, content: t.content });
    };

    const cancelEdit = () => setEditState(null);

    const save = async () => {
        if (!editState || !editState.name.trim() || !editState.content.trim()) return;
        setSaving(true);
        try {
            let res: Response;
            if (editState.id === null) {
                // Create
                res = await fetchWithAuth(mutateBase, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editState.name, type: activeTab, content: editState.content }),
                });
            } else {
                // Update
                res = await fetchWithAuth(`${mutateBase}/${editState.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: editState.name, content: editState.content }),
                });
            }
            if (res.ok) {
                setEditState(null);
                await fetchTemplates();
                setStatus('Gespeichert');
                setTimeout(() => setStatus(''), 2000);
            } else {
                const err = await res.json().catch(() => ({}));
                setStatus(err.detail || 'Fehler beim Speichern');
                setTimeout(() => setStatus(''), 3000);
            }
        } catch (error) {
            console.error('Save error:', error);
            setStatus('Netzwerkfehler beim Speichern');
            setTimeout(() => setStatus(''), 3000);
        } finally {
            setSaving(false);
        }
    };

    const deleteTemplate = async (t: NotificationTemplate) => {
        if (!confirm(`Template "${t.name}" löschen?`)) return;
        const url = adminMode
            ? `${baseUrl}/admin/notification-templates/${t.id}`
            : `${baseUrl}/notification-templates/${t.id}`;
        try {
            const res = await fetchWithAuth(url, { method: 'DELETE' });
            if (res.ok) {
                await fetchTemplates();
            }
        } catch { }
    };

    const canDelete = (t: NotificationTemplate) => {
        if (t.is_admin) return adminMode && isAdmin;
        return true;
    };

    const canEdit = (t: NotificationTemplate) => {
        if (t.is_admin) return adminMode && isAdmin;
        return true;
    };

    return (
        <div>

            {/* Tabs */}
            <div className="flex gap-1 mb-4 bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl w-fit">
                {(['GMAIL', 'PUSHOVER'] as TabType[]).map(tab => (
                    <button
                        key={tab}
                        type="button"
                        onClick={() => { setActiveTab(tab); setEditState(null); }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${activeTab === tab
                            ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                    >
                        {tab === 'GMAIL' ? <Mail className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
                        {tab === 'GMAIL' ? 'Gmail' : 'Pushover'}
                        {filtered.filter(t => t.type === tab).length > 0 && (
                            <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full text-[10px]">
                                {templates.filter(t => t.type === tab).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Template List */}
            <div className="space-y-2">
                {loading ? (
                    <p className="text-sm text-slate-400 animate-pulse">Lade Templates...</p>
                ) : filtered.length === 0 && !editState ? (
                    <div className="text-center py-8 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                        <p className="text-sm text-slate-400">Noch keine {activeTab === 'GMAIL' ? 'Gmail' : 'Pushover'}-Templates</p>
                    </div>
                ) : null}

                {filtered.map(t => (
                    editState?.id === t.id ? (
                        <TemplateEditForm
                            key={t.id}
                            editState={editState}
                            onChange={setEditState}
                            onSave={save}
                            onCancel={cancelEdit}
                            saving={saving}
                            placeholder={activeTab === 'GMAIL' ? GMAIL_PLACEHOLDER : PUSHOVER_PLACEHOLDER}
                            activeTab={activeTab}
                        />
                    ) : (
                        <div
                            key={t.id}
                            className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:hover:border-slate-700 transition-all"
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                    <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{t.name}</span>
                                    {t.is_admin && (
                                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50 shrink-0">
                                            <Lock className="w-2.5 h-2.5" />
                                            Global
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-400 font-mono truncate">{t.content.slice(0, 80)}{t.content.length > 80 ? '…' : ''}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                {canEdit(t) && (
                                    <button
                                        type="button"
                                        onClick={() => startEdit(t)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
                                        title="Bearbeiten"
                                    >
                                        <Pencil className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                {canDelete(t) && (
                                    <button
                                        type="button"
                                        onClick={() => deleteTemplate(t)}
                                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors cursor-pointer"
                                        title="Löschen"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )
                ))}

                {/* New template form */}
                {editState?.id === null && (
                    <TemplateEditForm
                        editState={editState}
                        onChange={setEditState}
                        onSave={save}
                        onCancel={cancelEdit}
                        saving={saving}
                        placeholder={activeTab === 'GMAIL' ? GMAIL_PLACEHOLDER : PUSHOVER_PLACEHOLDER}
                        activeTab={activeTab}
                    />
                )}
            </div>

            {/* Add button */}
            {!editState && (
                <button
                    type="button"
                    onClick={startNew}
                    className="mt-3 flex items-center gap-2 px-3 py-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors cursor-pointer"
                >
                    <Plus className="w-3.5 h-3.5" />
                    Neues {activeTab === 'GMAIL' ? 'Gmail' : 'Pushover'} Template
                </button>
            )}
        </div>
    );
}

function TemplateEditForm({
    editState,
    onChange,
    onSave,
    onCancel,
    saving,
    placeholder,
    activeTab,
}: {
    editState: EditState;
    onChange: (s: EditState) => void;
    onSave: () => void;
    onCancel: () => void;
    saving: boolean;
    placeholder: string;
    activeTab: TabType;
}) {
    return (
        <div className="p-3 rounded-xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50/30 dark:bg-indigo-900/10 space-y-2">
            <input
                type="text"
                value={editState.name}
                onChange={e => onChange({ ...editState, name: e.target.value })}
                placeholder="Template-Name"
                className="w-full text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {activeTab === 'GMAIL' && (
                <p className="text-[10px] text-slate-500">
                    Variablen: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$userName</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$jobCount</code>. In <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{`{{#jobs}}`}</code>: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$title</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$company</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$match_score</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$reasoning</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$url</code>
                </p>
            )}
            {activeTab === 'PUSHOVER' && (
                <p className="text-[10px] text-slate-500">
                    Variablen: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$title</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$company</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$match_score</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$reasoning</code> <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">$url</code>
                </p>
            )}
            <textarea
                value={editState.content}
                onChange={e => onChange({ ...editState, content: e.target.value })}
                placeholder={placeholder}
                rows={activeTab === 'GMAIL' ? 8 : 4}
                className="w-full font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-slate-800 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y min-h-[100px]"
                spellCheck={false}
            />
            <div className="flex justify-end gap-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                    Abbrechen
                </button>
                <button
                    type="button"
                    onClick={onSave}
                    disabled={saving || !editState.name.trim() || !editState.content.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <Check className="w-3.5 h-3.5" />
                    {saving ? 'Speichere...' : 'Speichern'}
                </button>
            </div>
        </div>
    );
}
