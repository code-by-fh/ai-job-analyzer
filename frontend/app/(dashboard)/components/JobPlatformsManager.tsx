"use client";
import { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../../components/LanguageProvider';
import ConfirmModal from '../../components/ConfirmModal';
import { useCrawl } from '../../hooks/useCrawl';
import { logger } from '../../lib/logger';
import { fetchWithAuth } from '../../components/AuthProvider';
import { Platform, LastRun } from './JobPlatforms/types';
import PlatformCard from './JobPlatforms/PlatformCard';
import GmailTemplateModal from './JobPlatforms/GmailTemplateModal';
import PushoverTemplateModal from './JobPlatforms/PushoverTemplateModal';
import AddPlatformInput from './JobPlatforms/AddPlatformInput';
import { NotificationTemplate } from '../../components/TemplateManager';

interface JobPlatformsManagerProps {
    token: string | null;
    user: any;
    initialPlatforms?: Platform[];
    configuredAdapters?: string[];
}

type TestStatus = 'idle' | 'sending' | 'ok' | 'error';

const sortByCreation = (list: Platform[]) => [...list].sort((a, b) => b.id - a.id);

export default function JobPlatformsManager({ token, user, initialPlatforms, configuredAdapters = [] }: JobPlatformsManagerProps) {
    const { t } = useLanguage();
    const [platforms, setPlatforms] = useState<Platform[]>(sortByCreation(initialPlatforms || []));
    const [pendingUrls, setPendingUrls] = useState<Set<string>>(new Set());
    const [lastRunByPlatform, setLastRunByPlatform] = useState<Record<string, LastRun>>({});
    const [expandedLog, setExpandedLog] = useState<string | null>(null);
    const [loading, setLoading] = useState(!initialPlatforms);
    const [newUrl, setNewUrl] = useState('');
    const [status, setStatus] = useState('');
    const [platformToRemove, setPlatformToRemove] = useState<number | null>(null);

    const [templatePlatform, setTemplatePlatform] = useState<Platform | null>(null);
    const [templateValue, setTemplateValue] = useState<string>('');
    const [recipientsValue, setRecipientsValue] = useState<string[]>([]);
    const [recipientInput, setRecipientInput] = useState<string>('');

    const [pushoverModalPlatform, setPushoverModalPlatform] = useState<Platform | null>(null);
    const [pushoverTemplateValue, setPushoverTemplateValue] = useState<string>('');
    const [pushoverModalTestStatus, setPushoverModalTestStatus] = useState<TestStatus>('idle');
    const [pushoverModalTestError, setPushoverModalTestError] = useState<string | null>(null);

    const [notificationTemplates, setNotificationTemplates] = useState<NotificationTemplate[]>([]);

    const [testMailStatus, setTestMailStatus] = useState<TestStatus>('idle');
    const [testMailError, setTestMailError] = useState<string | null>(null);
    const [pushoverTestStatus, setPushoverTestStatus] = useState<Record<number, TestStatus>>({});
    const [pushoverTestError, setPushoverTestError] = useState<Record<number, string | null>>({});

    const { activeCrawls } = useCrawl({ user, token });
    const savedToLastRunRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        try {
            const stored = localStorage.getItem('crawl_last_run');
            if (stored) setLastRunByPlatform(JSON.parse(stored));
        } catch { }
    }, []);

    useEffect(() => {
        activeCrawls.forEach((job) => {
            if ((job.show_success === true || job.status === 'failed') && !savedToLastRunRef.current.has(job.job_id)) {
                savedToLastRunRef.current.add(job.job_id);
                setLastRunByPlatform(prev => {
                    const next: Record<string, LastRun> = {
                        ...prev,
                        [job.platform]: {
                            total: job.total ?? 0,
                            total_found: job.total_found ?? job.total ?? 0,
                            saved: job.jobs_saved ?? 0,
                            skipped: job.jobs_skipped ?? 0,
                            scraping_completed: job.scraping_completed ?? 0,
                            analysis_completed: job.analysis_completed ?? 0,
                            status: job.status === 'failed' ? 'failed' : 'success',
                            error: job.error_message,
                            timestamp: new Date().toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
                        }
                    };
                    try { localStorage.setItem('crawl_last_run', JSON.stringify(next)); } catch { }
                    return next;
                });
                fetchPlatforms();
            }
        });
    }, [activeCrawls]);

    useEffect(() => {
        if (pendingUrls.size === 0) return;
        setPendingUrls(prev => {
            const next = new Set(prev);
            activeCrawls.forEach(job => next.delete(job.platform));
            return next;
        });
    }, [activeCrawls, pendingUrls.size]);

    const fetchPlatforms = async () => {
        if (!token) return;
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms`);
            if (res.ok) {
                const data: Platform[] = await res.json();
                setPlatforms(sortByCreation(data));
                setLastRunByPlatform(prev => {
                    const next = { ...prev };
                    const platformUrls = new Set(data.map(p => p.url));
                    let changed = false;
                    Object.keys(next).forEach(url => {
                        if (!platformUrls.has(url)) {
                            delete next[url];
                            changed = true;
                        }
                    });
                    if (changed) {
                        try { localStorage.setItem('crawl_last_run', JSON.stringify(next)); } catch { }
                        return next;
                    }
                    return prev;
                });
            }
        } catch (e) {
            logger.error({ err: e }, "Failed to fetch platforms");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!initialPlatforms) {
            fetchPlatforms();
        }
    }, [token, initialPlatforms]);

    useEffect(() => {
        if (!token) return;
        fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/notification-templates`)
            .then(res => res.ok ? res.json() : [])
            .then(setNotificationTemplates)
            .catch(() => { });
    }, [token]);

    const addPlatform = async () => {
        if (!newUrl) return;
        try {
            const parsed = new URL(newUrl);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
                setStatus(t('invalidUrlProtocol'));
                setTimeout(() => setStatus(''), 3000);
                return;
            }
        } catch (_) {
            setStatus(t('invalidUrl'));
            setTimeout(() => setStatus(''), 3000);
            return;
        }
        setStatus(t('adding'));
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: newUrl })
            });
            if (res.ok) {
                setNewUrl('');
                fetchPlatforms();
                setStatus(t('platformAdded'));
            } else {
                const err = await res.json();
                setStatus(`${t('error')}: ${err.detail || 'Failed to add'} ❌`);
            }
        } catch (e) {
            setStatus(t('error'));
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const finalizeRemovePlatform = async () => {
        if (!platformToRemove) return;
        try {
            await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platformToRemove}?delete_listings=true&keep_favorites=false&keep_applications=false`, {
                method: 'DELETE',
            });
            fetchPlatforms();
        } catch (e) {
            setStatus(`${t('error')} removing platform`);
            setTimeout(() => setStatus(''), 3000);
        }
        setPlatformToRemove(null);
    };

    const triggerCrawl = async (platform: Platform) => {
        setPendingUrls(prev => new Set(prev).add(platform.url));
        setStatus(t('startingCrawler'));
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platform.id}/crawl`, {
                method: 'POST',
            });
            if (res.ok) {
                setStatus(t('crawlJobsDispatched'));
                fetchPlatforms();
            } else {
                setStatus(t('error'));
                setPendingUrls(prev => { const next = new Set(prev); next.delete(platform.url); return next; });
            }
        } catch (e) {
            setStatus(t('error'));
            setPendingUrls(prev => { const next = new Set(prev); next.delete(platform.url); return next; });
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const updatePlatform = async (id: number, data: any) => {
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                fetchPlatforms();
            } else {
                const err = await res.json().catch(() => ({}));
                setStatus(`${t('error')}: ${err.detail || 'Failed to update'} ❌`);
                setTimeout(() => setStatus(''), 3000);
                logger.error({ status: res.status, err }, "Update platform failed");
            }
        } catch (e) {
            setStatus(t('networkError') || 'Network Error');
            setTimeout(() => setStatus(''), 3000);
            logger.error({ err: e }, "Update platform failed");
        }
    };

    const generatePlatformName = async (id: number) => {
        setStatus(t('generating') || 'Generating...');
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${id}/generate-name`, {
                method: 'POST',
            });
            if (res.ok) {
                fetchPlatforms();
                setStatus(t('updated') || 'Updated');
            } else {
                const err = await res.json().catch(() => ({}));
                setStatus(`${t('error')}: ${err.detail || 'Failed to generate'} ❌`);
            }
        } catch (e) {
            setStatus(t('error'));
        }
        setTimeout(() => setStatus(''), 3000);
    };

    const openTemplateModal = (platform: Platform) => {
        setTemplatePlatform(platform);
        setTemplateValue(platform.gmail_template || '');
        setRecipientsValue(platform.gmail_recipients || []);
        setRecipientInput('');
    };

    const saveTemplate = async () => {
        if (!templatePlatform) return;
        await updatePlatform(templatePlatform.id, {
            gmail_template: templateValue || null,
            gmail_recipients: recipientsValue,
        });
        setTemplatePlatform(null);
    };

    const addRecipient = () => {
        const email = recipientInput.trim().toLowerCase();
        if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !recipientsValue.includes(email)) {
            setRecipientsValue(prev => [...prev, email]);
        }
        setRecipientInput('');
    };

    const openPushoverModal = (platform: Platform) => {
        setPushoverModalPlatform(platform);
        setPushoverTemplateValue(platform.pushover_template || '');
        setPushoverModalTestStatus('idle');
        setPushoverModalTestError(null);
    };

    const savePushoverTemplate = async () => {
        if (!pushoverModalPlatform) return;
        await updatePlatform(pushoverModalPlatform.id, {
            pushover_template: pushoverTemplateValue || null,
        });
        setPushoverModalPlatform(null);
    };

    const sendTestPushoverFromModal = async () => {
        if (!pushoverModalPlatform) return;
        setPushoverModalTestStatus('sending');
        setPushoverModalTestError(null);
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${pushoverModalPlatform.id}/test-pushover`, {
                method: 'POST',
            });
            if (res.ok) {
                setPushoverModalTestStatus('ok');
            } else {
                const body = await res.json().catch(() => ({}));
                setPushoverModalTestError(body?.detail || `HTTP ${res.status}`);
                setPushoverModalTestStatus('error');
            }
        } catch (e: any) {
            setPushoverModalTestError(e?.message || 'Network error');
            setPushoverModalTestStatus('error');
        }
        setTimeout(() => setPushoverModalTestStatus('idle'), 5000);
    };

    const sendTestMail = async () => {
        if (!templatePlatform) return;
        setTestMailStatus('sending');
        setTestMailError(null);
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${templatePlatform.id}/test-gmail`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipients: recipientsValue.length > 0 ? recipientsValue : null,
                    template: templateValue || null,
                }),
            });
            if (res.ok) {
                setTestMailStatus('ok');
            } else {
                const body = await res.json().catch(() => ({}));
                setTestMailError(body?.detail || `HTTP ${res.status}`);
                setTestMailStatus('error');
            }
        } catch (e: any) {
            setTestMailError(e?.message || 'Network error');
            setTestMailStatus('error');
        }
        setTimeout(() => setTestMailStatus('idle'), 5000);
    };

    const sendTestPushover = async (platformId: number) => {
        setPushoverTestStatus(prev => ({ ...prev, [platformId]: 'sending' }));
        setPushoverTestError(prev => ({ ...prev, [platformId]: null }));
        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platformId}/test-pushover`, {
                method: 'POST',
            });
            if (res.ok) {
                setPushoverTestStatus(prev => ({ ...prev, [platformId]: 'ok' }));
            } else {
                const body = await res.json().catch(() => ({}));
                setPushoverTestError(prev => ({ ...prev, [platformId]: body?.detail || `HTTP ${res.status}` }));
                setPushoverTestStatus(prev => ({ ...prev, [platformId]: 'error' }));
            }
        } catch (e: any) {
            setPushoverTestError(prev => ({ ...prev, [platformId]: e?.message || 'Network error' }));
            setPushoverTestStatus(prev => ({ ...prev, [platformId]: 'error' }));
        }
        setTimeout(() => setPushoverTestStatus(prev => ({ ...prev, [platformId]: 'idle' })), 5000);
    };

    const toggleAdapter = async (platform: Platform, adapter: string) => {
        const current = platform.notification_adapters || [];
        const updated = current.includes(adapter) ? current.filter((a) => a !== adapter) : [...current, adapter];

        setPlatforms(prev => prev.map(p =>
            p.id === platform.id ? { ...p, notification_adapters: updated, is_notification_enabled: updated.length > 0 } : p
        ));

        try {
            const res = await fetchWithAuth(`${process.env.NEXT_PUBLIC_API_URL}/platforms/${platform.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notification_adapters: updated })
            });
            if (!res.ok) {
                setPlatforms(prev => prev.map(p =>
                    p.id === platform.id ? { ...p, notification_adapters: current, is_notification_enabled: current.length > 0 } : p
                ));
            }
        } catch {
            setPlatforms(prev => prev.map(p =>
                p.id === platform.id ? { ...p, notification_adapters: current, is_notification_enabled: current.length > 0 } : p
            ));
        }
    };

    if (loading) return <div className="text-slate-500 text-sm animate-pulse">{t('loading')}</div>;

    return (
        <section id="platforms-manager" className="bg-white dark:bg-slate-900/40 backdrop-blur-md rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <ConfirmModal
                isOpen={!!platformToRemove}
                onClose={() => { setPlatformToRemove(null); }}
                onConfirm={finalizeRemovePlatform}
                title={t('removePlatform')}
                message={t('areYouCertain')}
                confirmText={t('remove')}
                isDestructive
            >
                <div className="mt-2 flex flex-col gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-900/50">
                    <p className="text-sm text-rose-700 dark:text-rose-400 leading-relaxed font-medium">
                        ⚠️ <strong>Achtung:</strong> Beim Löschen dieser Plattform werden <strong>alle verknüpften Jobs, generierten Bewerbungen, Interview-Materialien und zugehörigen Firmenprofile</strong> restlos und unwiderruflich aus dem System entfernt.
                    </p>
                </div>
            </ConfirmModal>

            {templatePlatform && (
                <GmailTemplateModal
                    platform={templatePlatform}
                    templates={notificationTemplates}
                    templateValue={templateValue}
                    onTemplateChange={setTemplateValue}
                    recipientsValue={recipientsValue}
                    onRemoveRecipient={(email) => setRecipientsValue(prev => prev.filter(r => r !== email))}
                    recipientInput={recipientInput}
                    onRecipientInputChange={setRecipientInput}
                    onAddRecipient={addRecipient}
                    onClose={() => setTemplatePlatform(null)}
                    onSave={saveTemplate}
                    testMailStatus={testMailStatus}
                    testMailError={testMailError}
                    onSendTestMail={sendTestMail}
                    isAdmin={!!user?.is_admin}
                />
            )}

            {pushoverModalPlatform && (
                <PushoverTemplateModal
                    platform={pushoverModalPlatform}
                    templates={notificationTemplates}
                    templateValue={pushoverTemplateValue}
                    onTemplateChange={setPushoverTemplateValue}
                    onClose={() => setPushoverModalPlatform(null)}
                    onSave={savePushoverTemplate}
                    testStatus={pushoverModalTestStatus}
                    testError={pushoverModalTestError}
                    onSendTest={sendTestPushoverFromModal}
                    isAdmin={!!user?.is_admin}
                />
            )}

            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="font-bold text-slate-900 dark:text-white">{t('jobPlatforms')}</h2>
                    <p className="text-xs text-slate-500 mt-1">{t('platformsSubtitle')}</p>
                </div>
                {status && <span className="text-[10px] font-bold text-indigo-500 animate-pulse">{status}</span>}
            </div>

            <div className="space-y-4">
                {platforms.map((p) => {
                    const activeJob = Array.from(activeCrawls.values()).find(j => j.platform === p.url);
                    const isBusy = !!activeJob || pendingUrls.has(p.url);

                    return (
                        <PlatformCard
                            key={p.id}
                            platform={p}
                            isBusy={isBusy}
                            activeJob={activeJob}
                            lastRun={lastRunByPlatform[p.url]}
                            expandedLog={expandedLog}
                            configuredAdapters={configuredAdapters}
                            pushoverTestStatus={pushoverTestStatus}
                            pushoverTestError={pushoverTestError}
                            isAdmin={!!user?.is_admin}
                            onToggleLog={(url) => setExpandedLog(expandedLog === url ? null : url)}
                            onScheduleChange={(id, time, days) => updatePlatform(id, { schedule_time: time, schedule_days: days })}
                            onToggleAdapter={toggleAdapter}
                            onOpenTemplateModal={openTemplateModal}
                            onOpenPushoverModal={openPushoverModal}
                            onSendTestPushover={sendTestPushover}
                            onTriggerCrawl={triggerCrawl}
                            onToggleActive={(id, isActive) => updatePlatform(id, { is_active: isActive })}
                            onRemove={(id) => setPlatformToRemove(id)}
                            onUrlChange={(id, url) => updatePlatform(id, { url })}
                            onNameChange={(id, name) => updatePlatform(id, { name })}
                            onGenerateName={generatePlatformName}
                        />
                    );
                })}

                <AddPlatformInput
                    newUrl={newUrl}
                    onUrlChange={setNewUrl}
                    onAdd={addPlatform}
                    isProfileComplete={!!user?.is_profile_complete}
                />
            </div>
        </section>
    );
}
