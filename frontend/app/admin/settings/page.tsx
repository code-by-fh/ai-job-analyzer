"use client";
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, fetchWithAuth } from '../../components/AuthProvider';
import { useLanguage } from '../../components/LanguageProvider';
import { useRouter } from 'next/navigation';
import PageWrapper from '../../components/PageWrapper';
import PageHeader from '../../components/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import { logger } from '../../lib/logger';
import { Key, Bot, ChevronDown, CheckCircle2, RefreshCw, Search, X, ExternalLink } from 'lucide-react';

interface OpenRouterModel {
    id: string;
    name: string;
    context_length: number | null;
    pricing: {
        prompt?: string;
        completion?: string;
    };
}

export default function AdminSettingsPage() {
    const { user, token, isAuthenticated } = useAuth();
    const { t } = useLanguage();
    const router = useRouter();

    const [model, setModel] = useState('');
    const [apiKey, setApiKey] = useState('');
    const [apiKeySet, setApiKeySet] = useState(false);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState('');

    const [models, setModels] = useState<OpenRouterModel[]>([]);
    const [modelsLoading, setModelsLoading] = useState(false);
    const [modelsError, setModelsError] = useState('');
    const [modelSearch, setModelSearch] = useState('');
    const [freeOnly, setFreeOnly] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const [showWipeModal, setShowWipeModal] = useState(false);
    const [wipePassword, setWipePassword] = useState('');
    const [wipeAllUsers, setWipeAllUsers] = useState(false);
    const [wipeStatus, setWipeStatus] = useState('');
    const [wipeLoading, setWipeLoading] = useState(false);

    const handleWipeDatabase = async () => {
        if (!wipePassword) {
            setWipeStatus('Passwort erforderlich');
            setShowWipeModal(false);
            return;
        }

        setWipeLoading(true);
        setWipeStatus('Lösche Datenbank...');

        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/database/wipe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    password: wipePassword,
                    wipe_all_users: wipeAllUsers
                })
            });

            if (res.ok) {
                setWipeStatus('Datenbank erfolgreich zurückgesetzt.');
                try {
                    localStorage.removeItem('crawl_last_run');
                } catch (e) {
                    logger.error('Failed to clear localStorage after wipe');
                }
            } else {
                const data = await res.json();
                setWipeStatus(`Fehler: ${data.detail || 'Konnte Datenbank nicht löschen'}`);
            }
        } catch (e) {
            setWipeStatus('Netzwerkfehler beim Löschen der Datenbank');
        } finally {
            setWipeLoading(false);
            setWipePassword('');
        }

        setTimeout(() => setWipeStatus(''), 5000);
    };

    useEffect(() => {
        if (!isAuthenticated) return;
        if (user && !user.is_admin) {
            router.push('/');
            return;
        }
        if (token) fetchSettings();
    }, [isAuthenticated, user, token]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchSettings = async () => {
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/settings`);
            if (res.ok) {
                const data = await res.json();
                setModel(data.openrouter_model);
                setApiKeySet(data.openrouter_api_key_set ?? false);
            }
        } catch (e) {
            logger.error({ err: e }, "Fetch settings failed");
        } finally {
            setLoading(false);
        }
    };

    const fetchModels = useCallback(async () => {
        setModelsLoading(true);
        setModelsError('');
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/openrouter/models`);
            if (res.ok) {
                const data: OpenRouterModel[] = await res.json();
                setModels(data);
                setDropdownOpen(true);
            } else {
                const err = await res.json();
                setModelsError(err.detail || 'Failed to load models');
            }
        } catch (e) {
            setModelsError('Network error loading models');
        } finally {
            setModelsLoading(false);
        }
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setStatus('Saving...');
        try {
            const payload: Record<string, string | null> = { openrouter_model: model };
            if (apiKey !== '') {
                payload.openrouter_api_key = apiKey || null;
            }
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/admin/settings`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                setStatus('Saved successfully!');
                setApiKeySet(data.openrouter_api_key_set ?? false);
                setApiKey('');
            } else {
                setStatus('Error saving settings');
            }
        } catch (e) {
            setStatus('Error saving settings');
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const filteredModels = models.filter(m => {
        const matchesSearch =
            m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
            m.id.toLowerCase().includes(modelSearch.toLowerCase());
        const isFree = parseFloat(m.pricing?.prompt ?? '0') === 0;
        return matchesSearch && (!freeOnly || isFree);
    });

    const selectedModel = models.find(m => m.id === model);

    const formatPrice = (price: string | undefined) => {
        if (!price) return null;
        const num = parseFloat(price);
        if (num === 0) return 'free';
        return `$${(num * 1_000_000).toFixed(2)}/M`;
    };

    const formatContext = (ctx: number | null) => {
        if (!ctx) return null;
        if (ctx >= 1_000_000) return `${(ctx / 1_000_000).toFixed(0)}M`;
        if (ctx >= 1_000) return `${(ctx / 1_000).toFixed(0)}K`;
        return `${ctx}`;
    };

    if (!user || !user.is_admin) return <div className="p-8 text-center text-slate-500 animate-pulse">{t('verifyingClearance') || "Verifying..."}</div>;

    return (
        <PageWrapper>
            <PageHeader title="Admin Settings" subtitle="Global System Configuration" />

            <div className="relative z-20 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
                <form onSubmit={handleSave} className="space-y-6">

                    {/* API Key Section */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-3">
                            <Key className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                OpenRouter API Key
                            </h3>
                            {apiKeySet && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Key configured
                                </span>
                            )}
                        </div>
                        <input
                            id="openrouter-api-key"
                            type="password"
                            className="w-full bg-slate-50 dark:bg-slate-950/50 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 font-mono text-sm"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder={apiKeySet ? '••••••••  (leave blank to keep current)' : 'sk-or-v1-...'}
                            autoComplete="off"
                        />
                        <p className="text-xs text-slate-500 dark:text-slate-500">
                            Your{' '}
                            <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" className="text-indigo-500 hover:underline inline-flex items-center gap-0.5">
                                OpenRouter API key
                                <ExternalLink className="w-3 h-3" />
                            </a>
                            {'. '}
                            If set, this overrides the server environment variable for all AI operations.
                            {apiKeySet && (
                                <button
                                    type="button"
                                    className="ml-2 text-rose-500 hover:underline"
                                    onClick={() => setApiKey('')}
                                >
                                    Clear key
                                </button>
                            )}
                        </p>
                    </div>

                    <div className="border-t border-slate-100 dark:border-slate-800" />

                    {/* Model Section */}
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 mb-3">
                            <Bot className="w-4 h-4 text-indigo-500" />
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                AI Model
                            </h3>
                        </div>

                        <div className="flex gap-2">
                            <div className="relative flex-1" ref={dropdownRef}>
                                <button
                                    type="button"
                                    id="model-selector"
                                    className="w-full flex items-center justify-between bg-slate-50 dark:bg-slate-950/50 hover:bg-slate-100 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-left focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer"
                                    onClick={() => {
                                        if (models.length > 0) {
                                            setDropdownOpen(o => !o);
                                        } else {
                                            fetchModels();
                                        }
                                    }}
                                >
                                    <div className="min-w-0">
                                        {selectedModel ? (
                                            <div>
                                                <span className="block text-sm font-medium text-slate-900 dark:text-white truncate">{selectedModel.name}</span>
                                                <span className="block text-xs text-slate-400 font-mono truncate">{selectedModel.id}</span>
                                            </div>
                                        ) : (
                                            <span className="text-sm text-slate-500 font-mono truncate">{model || 'Select a model...'}</span>
                                        )}
                                    </div>
                                    <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 ml-2 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {dropdownOpen && models.length > 0 && (
                                    <div className="absolute z-[100] mt-2 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl shadow-slate-900/20 overflow-hidden">
                                        <div className="p-2 space-y-1.5 border-b border-slate-100 dark:border-slate-800">
                                            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                                                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                                                <input
                                                    type="text"
                                                    autoFocus
                                                    className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
                                                    placeholder="Search models..."
                                                    value={modelSearch}
                                                    onChange={e => setModelSearch(e.target.value)}
                                                />
                                                {modelSearch && (
                                                    <button type="button" onClick={() => setModelSearch('')}>
                                                        <X className="w-3 h-3 text-slate-400 hover:text-slate-600" />
                                                    </button>
                                                )}
                                            </div>
                                            <div className="px-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setFreeOnly(v => !v)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                                                        freeOnly
                                                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30'
                                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-600'
                                                    }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${freeOnly ? 'bg-white' : 'bg-slate-300 dark:bg-slate-600'}`} />
                                                    Only free models
                                                </button>
                                            </div>
                                        </div>
                                        <ul className="max-h-72 overflow-y-auto py-1">
                                            {filteredModels.length === 0 ? (
                                                <li className="px-4 py-3 text-sm text-slate-400 text-center">No models found</li>
                                            ) : filteredModels.map(m => (
                                                <li key={m.id}>
                                                    <button
                                                        type="button"
                                                        className={`w-full text-left px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition ${model === m.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                                                        onClick={() => {
                                                            setModel(m.id);
                                                            setDropdownOpen(false);
                                                            setModelSearch('');
                                                        }}
                                                    >
                                                        <div className="min-w-0">
                                                            <span className={`block text-sm font-medium truncate ${model === m.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                                                {m.name}
                                                            </span>
                                                            <span className="block text-xs text-slate-400 font-mono truncate">{m.id}</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0 ml-4">
                                                            {formatContext(m.context_length) && (
                                                                <span className="text-xs text-slate-400 whitespace-nowrap">{formatContext(m.context_length)} ctx</span>
                                                            )}
                                                            {formatPrice(m.pricing?.prompt) && (
                                                                <span className={`text-xs font-medium whitespace-nowrap px-1.5 py-0.5 rounded ${formatPrice(m.pricing?.prompt) === 'free' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                                                                    {formatPrice(m.pricing?.prompt)}
                                                                </span>
                                                            )}
                                                            {model === m.id && <CheckCircle2 className="w-4 h-4 text-indigo-500" />}
                                                        </div>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                title="Load models from OpenRouter"
                                onClick={fetchModels}
                                disabled={modelsLoading}
                                className="flex items-center gap-2 px-3 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <RefreshCw className={`w-4 h-4 ${modelsLoading ? 'animate-spin' : ''}`} />
                            </button>
                        </div>

                        {modelsError && (
                            <p className="text-xs text-rose-500">{modelsError}. Make sure your API key is saved first.</p>
                        )}

                        {models.length === 0 && !modelsLoading && (
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                                Current model: <code className="text-indigo-500">{model || 'tngtech/deepseek-r1t2-chimera:free'}</code>.
                                Click the refresh button to load available models from OpenRouter.
                            </p>
                        )}
                        {models.length > 0 && (
                            <p className="text-xs text-slate-500 dark:text-slate-500">
                                {models.length} models loaded from OpenRouter.
                            </p>
                        )}
                    </div>

                    <div className="flex items-center justify-between pt-2">
                        <button
                            type="submit"
                            className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-indigo-500/20 transition active:scale-95 cursor-pointer"
                        >
                            Save Configuration
                        </button>
                        {status && (
                            <span className={`text-sm font-bold ${status.includes('Error') ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {status}
                            </span>
                        )}
                    </div>
                </form>
            </div>

            {/* Danger Zone */}
            <div className="relative z-10 mt-8 bg-white dark:bg-slate-900/40 backdrop-blur-md p-6 rounded-2xl border border-rose-200 dark:border-rose-900">
                <h3 className="text-lg font-bold text-rose-600 dark:text-rose-500 mb-2">Danger Zone</h3>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Hier kannst du die komplette Datenbank zurücksetzen. Dabei werden alle Jobs, generierten Bewerbungen,
                    Interview-Materialien, verknüpften Plattformen und Firmenprofile gelöscht.
                    Benutzerkonten und Globale Einstellungen bleiben erhalten.
                </p>
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setShowWipeModal(true)}
                        className="bg-rose-600 hover:bg-rose-500 text-white px-6 py-2.5 rounded-xl font-bold shadow-lg shadow-rose-500/20 transition active:scale-95 cursor-pointer"
                    >
                        Datenbank löschen...
                    </button>
                    {wipeStatus && (
                        <span className={`text-sm font-bold ${wipeStatus.includes('Error') ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {wipeStatus}
                        </span>
                    )}
                </div>
            </div>

            <ConfirmModal
                isOpen={showWipeModal}
                onClose={() => { setShowWipeModal(false); setWipePassword(''); setWipeStatus(''); }}
                onConfirm={handleWipeDatabase}
                title="Datenbank unwiderruflich löschen"
                message="Bist du sicher, dass du die Datenbank löschen möchtest? Dies kann nicht rückgängig gemacht werden."
                confirmText={wipeLoading ? "Lösche..." : "Dauerhaft löschen"}
                cancelText="Abbrechen"
                isDestructive
            >
                <div className="space-y-4">
                    <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50">
                        <input
                            type="checkbox"
                            id="wipeAllUsers"
                            checked={wipeAllUsers}
                            onChange={(e) => setWipeAllUsers(e.target.checked)}
                            className="appearance-none w-4 h-4 border border-rose-400 dark:border-rose-600 rounded bg-white dark:bg-slate-900 checked:bg-rose-500 checked:border-rose-500 cursor-pointer relative after:content-['✓'] after:absolute after:text-white after:text-[10px] after:font-bold after:left-1/2 after:top-1/2 after:-translate-x-1/2 after:-translate-y-1/2 after:opacity-0 checked:after:opacity-100 transition-colors shrink-0"
                        />
                        <label htmlFor="wipeAllUsers" className="text-sm text-rose-800 dark:text-rose-400 cursor-pointer leading-tight font-medium">
                            Gesamte Datenbank löschen (Daten von ALLEN Nutzern entfernen)
                        </label>
                    </div>

                    {!wipeAllUsers && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Wenn deaktiviert, werden nur die Jobs, Plattformen und Einträge deines <b>eigenen Admin-Accounts</b> komplett gelöscht.
                        </p>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Admin Passwort bestätigen:
                        </label>
                        <input
                            type="password"
                            value={wipePassword}
                            onChange={(e) => setWipePassword(e.target.value)}
                            placeholder="Dein Passwort"
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-xl px-4 py-2.5 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                        />
                    </div>
                </div>
            </ConfirmModal>

        </PageWrapper>
    );
}
